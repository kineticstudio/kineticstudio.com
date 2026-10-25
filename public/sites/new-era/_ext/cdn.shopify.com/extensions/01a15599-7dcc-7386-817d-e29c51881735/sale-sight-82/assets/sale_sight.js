(() => {
	window.SaleSight = window.SaleSight || {};

	// Find the block element — all config is passed via data- attributes from Liquid
	const blockElement = document.querySelector(".sale-sight-discount-display");
	if (!blockElement) return;

	const config = {
		blockId: blockElement.dataset.blockId,
		enabled: blockElement.dataset.enabled === "true",
		debugMode: blockElement.dataset.debug === "true",
		shopDomain: blockElement.dataset.shopDomain,
		currencyCode: blockElement.dataset.currencyCode,
		subscriptionGuard: blockElement.dataset.subscriptionGuard === "true",
		refreshEvents: (blockElement.dataset.refreshEvents || "")
			.split(",")
			.map((name) => name.trim())
			.filter(Boolean),
		products: parseLiquidProducts(),
		selectors: null,
	};

	function parseLiquidProducts() {
		const dataElement = blockElement.querySelector(
			"[data-sale-sight-products]",
		);
		if (!dataElement?.textContent) return [];
		try {
			const products = JSON.parse(dataElement.textContent);
			return Array.isArray(products) ? products : [];
		} catch {
			return [];
		}
	}

	const log = (...args) =>
		config.debugMode && console.log("Sale Sight:", ...args);
	const logError = (...args) =>
		config.debugMode && console.error("Sale Sight:", ...args);

	const APP_URL = "/sites/new-era/apps/sale-sight";
	const BATCH_SIZE = 50;
	const FETCH_TIMEOUT_MS = 5000;
	const MARKER_CLASS = "sale-sight-price-replaced";
	const RELATED_SECTION_SELECTOR =
		'.related-products, .product-recommendations, [class*="recommendation"], [class*="related"], .slider, .carousel, .swiper';
	const PRODUCT_SELECTOR =
		'[data-product-id], .product-card, a[href*="/products/"]';

	const PRODUCT_PAGE_SELECTORS = [
		"product-info",
		".product-info",
		".product__info",
		".product__info-wrapper",
		".product-form",
		".product-main",
		".product-main__info",
		".product-details",
		".product-single",
		".product",
		".product--large",
		".product--medium",
		".product--small",
		'[data-section-type="product"]',
		"[data-product-container]",
		'[data-section="product"]',
		'form[action*="/cart/add"]',
		'[class*="product-template"]',
		'[class*="product__"]',
		'[id*="ProductSection"]',
		"section.product",
		".product-section",
	];

	// Tracks identifiers already processed to avoid redundant API calls on MutationObserver re-runs
	const processedIdentifiers = new Set();
	const discountDataCache = new Map();
	// Bumped whenever prices must be recomputed (e.g. the shopper logged in).
	// A response for an older generation describes a shopper who is no longer
	// there, so it is dropped rather than painted.
	let pricingGeneration = 0;

	function getMainContent() {
		return (
			document.querySelector("#MainContent") ||
			document.querySelector("main") ||
			document.querySelector('[role="main"]') ||
			document.querySelector("#main") ||
			document.body
		);
	}

	function queryFirst(container, selectors) {
		for (const selector of selectors) {
			const el = container.querySelector(selector);
			if (el) return el;
		}
		return null;
	}

	function isInRelatedSection(element) {
		return element.closest(RELATED_SECTION_SELECTOR);
	}

	function findProductCardContainer(element) {
		if (element.tagName === "A" || element.className.includes("button")) {
			return (
				element.closest(
					'li.grid__item, .product-card, .card-wrapper, .product-item, [class*="product"], [class*="card"]',
				) ||
				element.parentElement ||
				element
			);
		}
		return element;
	}

	function createReplacedMarker(discount) {
		const marker = document.createElement("span");
		marker.className = MARKER_CLASS;
		marker.style.display = "none";
		marker.setAttribute("data-sale-sight-discount", discount.percentage + "%");
		marker.setAttribute("data-sale-sight-source", discount.source || "unknown");
		return marker;
	}

	function createDebugIndicator(discount) {
		const indicator = document.createElement("span");
		indicator.className = "sale-sight-source-indicator";
		indicator.style.cssText =
			"font-size:0.7em;background:#4caf50;color:white;padding:2px 4px;border-radius:2px;margin-left:4px;font-weight:bold;";
		indicator.textContent = (discount.source || "unknown").toUpperCase();
		indicator.title = "Data source: " + discount.source;
		return indicator;
	}

	function fetchWithTimeout(url, timeoutMs, init = {}) {
		var controller = new AbortController();
		var timer = setTimeout(() => {
			controller.abort();
		}, timeoutMs);
		return fetch(url, { ...init, signal: controller.signal }).finally(() => {
			clearTimeout(timer);
		});
	}

	function batchArray(arr, size) {
		const batches = [];
		for (let i = 0; i < arr.length; i += size) {
			batches.push(arr.slice(i, i + size));
		}
		return batches;
	}

	function getUncachedIdentifiers(productIds, productHandles) {
		return {
			ids: Array.from(productIds).filter(
				(id) => !(processedIdentifiers.has(id) || discountDataCache.has(id)),
			),
			handles: Array.from(productHandles).filter(
				(handle) =>
					!(processedIdentifiers.has(handle) || discountDataCache.has(handle)),
			),
		};
	}

	function markIdentifiersProcessed(identifiers) {
		for (const identifier of identifiers) {
			processedIdentifiers.add(identifier);
		}
	}

	function cacheDiscountData(realDiscountData) {
		for (const identifier of Object.keys(realDiscountData.data.products)) {
			const discount = realDiscountData.data.products[identifier];
			discountDataCache.set(identifier, discount);

			if (discount?.handle) {
				discountDataCache.set(discount.handle, discount);
			}
		}
	}

	function getCachedDiscountData(productIds, productHandles) {
		const products = {};
		for (const identifier of Array.from(productIds).concat(
			Array.from(productHandles),
		)) {
			if (discountDataCache.has(identifier)) {
				products[identifier] = discountDataCache.get(identifier);
			}
		}

		return {
			success: true,
			data: { products },
		};
	}

	async function fetchShopConfig() {
		try {
			const response = await fetchWithTimeout(
				APP_URL + "/api/public/shop-config?shop=" + config.shopDomain,
				FETCH_TIMEOUT_MS,
			);
			if (response.ok) {
				const data = await response.json();
				if (data.success && data.data?.config) {
					config.selectors = data.data.config.selectors;
					log("Loaded shop config:", data.data.config);
				}
			}
		} catch (error) {
			logError("Failed to fetch shop config:", error);
		}

		// Fallback defaults — canonical source is api.public.shop-config.tsx
		if (!config.selectors) {
			config.selectors = {
				priceContainerSelectors: [
					".price",
					".price--large",
					".price--medium",
					".price--small",
					".card__price",
					".product__price",
					".card-information__price",
					".price-item",
					'[class*="price"]',
				],
				regularPriceSelectors: [
					".price__regular",
					".price-item--regular",
					"[data-price-regular]",
					".regular-price",
					".price--regular",
				],
				salePriceSelectors: [
					".price__sale",
					".price-item--sale",
					"[data-price-sale]",
					".sale-price",
					".price--on-sale",
				],
			};
		}
	}

	async function ensureSelectors(discountData) {
		if (config.selectors) return;

		const bundledSelectors = discountData?.data?.config?.selectors;
		if (bundledSelectors) {
			config.selectors = bundledSelectors;
			return;
		}

		await fetchShopConfig();
	}

	function collectIdentifiers() {
		const productIds = new Set();
		const productHandles = new Set();
		const elementMap = new Map();
		let mainProductHandle = null;
		const isProductPage = window.location.pathname.includes("/products/");

		addLiquidProductHandles(productHandles);

		if (isProductPage) {
			const urlMatch = window.location.pathname.match(/\/products\/([^?/]+)/);
			if (urlMatch?.[1]) {
				mainProductHandle = urlMatch[1];
				productHandles.add(mainProductHandle);
				elementMap.set(mainProductHandle, "main-product");
				log("Detected main product from URL:", mainProductHandle);
			}
		}

		// DOM scan to build the element map (needed for applying prices to the right containers)
		const contentArea = getMainContent();
		const productElements = contentArea.querySelectorAll(
			"li.grid__item, .product-card, " + PRODUCT_SELECTOR,
		);
		const collectedIdentifiers = new Set();

		for (const element of productElements) {
			collectProductElementIdentifier(
				element,
				{
					productIds,
					productHandles,
					elementMap,
					collectedIdentifiers,
				},
				mainProductHandle,
			);
		}

		return {
			productIds,
			productHandles,
			elementMap,
			mainProductHandle,
			isProductPage,
		};
	}

	function addLiquidProductHandles(productHandles) {
		const liquidHandles =
			blockElement.dataset.productHandles || blockElement.dataset.productIds;
		if (!liquidHandles) return;

		for (const handle of liquidHandles.split(",")) {
			const trimmed = handle.trim();
			if (trimmed) productHandles.add(trimmed);
		}
	}

	function collectProductElementIdentifier(
		element,
		collection,
		mainProductHandle,
	) {
		const identifier = getProductIdentifier(element);
		if (!identifier) return;

		const identifierKey = identifier.type + ":" + identifier.value;
		if (collection.collectedIdentifiers.has(identifierKey)) return;
		collection.collectedIdentifiers.add(identifierKey);

		const productContainer = findProductCardContainer(element);
		const inRelated = isInRelatedSection(productContainer);
		if (
			mainProductHandle &&
			identifier.value === mainProductHandle &&
			inRelated
		) {
			return;
		}

		if (identifier.type === "id") {
			collection.productIds.add(identifier.value);
		} else {
			collection.productHandles.add(identifier.value);
		}

		const isQuickAddForm =
			productContainer.tagName === "QUICK-ADD-PRODUCT" ||
			productContainer.tagName === "PRODUCT-FORM" ||
			productContainer.className.includes("product-form");

		if (
			!collection.elementMap.has(identifier.value) ||
			!(inRelated || isQuickAddForm)
		) {
			collection.elementMap.set(identifier.value, productContainer);
		}

		log(
			"Found product " +
				identifier.type +
				": " +
				identifier.value +
				(inRelated ? " (in related section)" : ""),
		);
	}

	async function replaceProductPrices() {
		log("Starting discount price replacement...");

		const identifiers = collectIdentifiers();
		const uncached = getUncachedIdentifiers(
			identifiers.productIds,
			identifiers.productHandles,
		);

		if (uncached.ids.length > 0 || uncached.handles.length > 0) {
			log(
				"Found " +
					uncached.ids.length +
					" new IDs and " +
					uncached.handles.length +
					" new handles",
			);

			const generation = pricingGeneration;
			const fetchedDiscountData = await fetchRealDiscountData(
				uncached.ids,
				uncached.handles,
			);
			if (generation !== pricingGeneration) {
				log("Dropping prices fetched for a previous shopper");
				return;
			}
			if (!fetchedDiscountData?.data?.products) {
				log("Failed to fetch real discount data");
				return;
			}

			await ensureSelectors(fetchedDiscountData);
			cacheDiscountData(fetchedDiscountData);
		}

		const realDiscountData = getCachedDiscountData(
			identifiers.productIds,
			identifiers.productHandles,
		);
		if (Object.keys(realDiscountData.data.products).length === 0) {
			log("No new product identifiers to process");
			return;
		}

		const appliedIdentifiers = applyDiscountData(realDiscountData, identifiers);
		markIdentifiersProcessed(appliedIdentifiers);
	}

	function applyDiscountData(realDiscountData, identifiers) {
		let pricesReplaced = 0;
		const appliedIdentifiers = [];
		const elementMap = identifiers.elementMap;
		const mainProductHandle = identifiers.mainProductHandle;
		const isProductPage = identifiers.isProductPage;

		for (const identifier of Object.keys(realDiscountData.data.products)) {
			const discount = realDiscountData.data.products[identifier];
			if (!discount?.eligible) continue;

			const isMainProduct = isMainProductDiscount(
				identifier,
				discount,
				mainProductHandle,
			);
			const element = resolveDiscountElement(
				identifier,
				elementMap,
				isMainProduct,
				isProductPage,
			);
			if (!element) {
				log("No element found for " + identifier);
				continue;
			}

			// Contamination prevention on PDPs
			if (isProductPage && !isMainProduct && !isInRelatedSection(element)) {
				log(
					"Warning - non-main product " +
						identifier +
						" not in related section, skipping",
				);
				continue;
			}

			const priceContainer = findPriceContainer(
				element,
				isMainProduct,
				isProductPage,
			);

			if (priceContainer) {
				if (activateSalePrice(priceContainer, discount)) {
					pricesReplaced++;
					appliedIdentifiers.push(identifier);
					if (discount.handle) {
						appliedIdentifiers.push(discount.handle);
					}
					log(
						"Replaced price for " +
							identifier +
							" (source: " +
							discount.source +
							")",
					);
				}
			} else {
				log("No price container found for " + identifier);
			}
		}

		log("Replaced " + pricesReplaced + " product prices");
		return appliedIdentifiers;
	}

	function isMainProductDiscount(identifier, discount, mainProductHandle) {
		return Boolean(
			mainProductHandle &&
				(identifier === mainProductHandle ||
					discount.handle === mainProductHandle),
		);
	}

	function resolveDiscountElement(
		identifier,
		elementMap,
		isMainProduct,
		isProductPage,
	) {
		let element = elementMap.get(identifier);

		if (element === "main-product") {
			if (!isMainProduct) return null;
			element = null;
		}

		if (!element && isProductPage && isMainProduct) {
			return queryFirst(document, PRODUCT_PAGE_SELECTORS) || getMainContent();
		}

		return element;
	}

	function findPriceContainer(element, isMainProduct, isProductPage) {
		const searchScope = findProductCardContainer(element);

		if (config.selectors?.priceContainerSelectors) {
			const configuredPriceContainer = findConfiguredPriceContainer(
				searchScope,
				isMainProduct,
				isProductPage,
			);
			if (configuredPriceContainer) return configuredPriceContainer;

			if (isProductPage && isMainProduct) {
				return (
					findMainProductPriceContainer() ||
					findFallbackPriceContainer(element, isMainProduct, isProductPage)
				);
			}
		}

		return findFallbackPriceContainer(element, isMainProduct, isProductPage);
	}

	function findConfiguredPriceContainer(
		searchScope,
		isMainProduct,
		isProductPage,
	) {
		for (const selector of config.selectors.priceContainerSelectors) {
			const found = searchScope.querySelector(selector);
			if (!found) continue;
			if (!isMainProduct && isProductPage && isMainProductPriceCandidate(found))
				continue;
			return found;
		}

		return null;
	}

	function isMainProductPriceCandidate(element) {
		return (
			element.classList.contains("price--large") ||
			element.closest(".product__info") ||
			element.closest(".product-main") ||
			(element.closest(".price") && !element.closest(".ne-product-card"))
		);
	}

	function findMainProductPriceContainer() {
		log("Searching for MAIN product price in product section");

		const productSection = findMainProductSection();
		if (productSection) {
			const found = queryFirst(
				productSection,
				config.selectors.priceContainerSelectors,
			);
			if (found) return found;
		}

		for (const selector of [".price--large", ".price.price--large"]) {
			const found = document.querySelector(selector);
			if (found && !isInRelatedSection(found)) {
				log("Found MAIN product price globally: " + selector);
				return found;
			}
		}

		return null;
	}

	function findMainProductSection() {
		for (const selector of PRODUCT_PAGE_SELECTORS) {
			const productSection = document.querySelector(selector);
			if (productSection && !isInRelatedSection(productSection))
				return productSection;
		}

		return null;
	}

	function findFallbackPriceContainer(element, isMainProduct, isProductPage) {
		const fallback =
			element.querySelector(".price") ||
			element.querySelector('[class*="price"]');
		if (fallback) return fallback;

		if (isProductPage && isMainProduct) {
			return (
				document.querySelector(".price:not(.related-products .price)") ||
				document.querySelector(
					'[class*="price"]:not(.related-products [class*="price"])',
				)
			);
		}

		return null;
	}

	async function fetchRealDiscountData(productIds, productHandles) {
		const identifiers = productIds
			.map((value) => ({ type: "id", value }))
			.concat(productHandles.map((value) => ({ type: "handle", value })));
		const quoteEntries = [];
		const legacyHandles = [];
		for (const identifier of identifiers) {
			const request = createQuoteRequest(identifier);
			if (request) {
				quoteEntries.push({ identifier, request });
			} else if (identifier.type === "handle") {
				legacyHandles.push(identifier.value);
			}
		}
		if (quoteEntries.length === 0 && legacyHandles.length === 0) return null;

		const [quoteProducts, legacyProducts] = await Promise.all([
			fetchQuoteProducts(quoteEntries),
			fetchLegacyHandleProducts(legacyHandles),
		]);
		if (!(quoteProducts || legacyProducts)) return null;

		// Quotes win on collision: they carry the exact variant Liquid rendered.
		const products = Object.assign({}, legacyProducts, quoteProducts);
		log("Total products retrieved:", Object.keys(products).length);
		return { success: true, data: { products } };
	}

	// Products the Liquid island described are quoted against their rendered
	// variant and price; a DOM-discovered numeric id is quoted product-wide and
	// the server fails closed when the product prices more than one variant.
	async function fetchQuoteProducts(entries) {
		if (entries.length === 0) return null;
		const batches = batchArray(entries, BATCH_SIZE);
		log(
			"Fetching " +
				batches.length +
				" quote batch(es) (" +
				entries.length +
				" quote requests)",
		);
		const responses = (await Promise.all(batches.map(postQuoteBatch))).filter(
			Boolean,
		);
		if (responses.length === 0) return null;
		return mergeQuoteResponses(responses);
	}

	function postQuoteBatch(batch, index) {
		return fetchWithTimeout(
			APP_URL + "/api/public/discounts/quotes",
			FETCH_TIMEOUT_MS,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					shop: config.shopDomain,
					products: batch.map((entry) => entry.request),
				}),
			},
		)
			.then((r) => {
				if (!r.ok) throw new Error("HTTP " + r.status);
				return r.json();
			})
			.then((response) => ({ response, batch }))
			.catch((error) => {
				logError("Failed to fetch quote batch " + (index + 1) + ":", error);
				return null;
			});
	}

	// Handles absent from the Liquid island (home, search, AJAX-loaded cards)
	// have no product GID, which the quotes contract requires. The legacy lookup
	// resolves them server-side and omits products it cannot price unambiguously.
	async function fetchLegacyHandleProducts(handles) {
		if (handles.length === 0) return null;
		const responses = (
			await Promise.all(batchArray(handles, BATCH_SIZE).map(getLegacyBatch))
		).filter(Boolean);
		if (responses.length === 0) return null;

		const products = {};
		for (const response of responses) {
			const entries = response?.data?.products || {};
			for (const handle of Object.keys(entries)) {
				const product = entries[handle];
				if (!product) continue;
				// Ineligible handles are recorded rather than dropped: an omitted
				// handle never reaches the cache, so every mutation re-requests it.
				products[handle] = product.eligible
					? { ...product, source: "legacy", handle }
					: { eligible: false, handle };
			}
		}
		return products;
	}

	function getLegacyBatch(handles) {
		const query = handles
			.map((handle) => "handles[]=" + encodeURIComponent(handle))
			.join("&");
		return fetchWithTimeout(
			APP_URL +
				"/api/public/discounts/products?shop=" +
				encodeURIComponent(config.shopDomain) +
				"&" +
				query,
			FETCH_TIMEOUT_MS,
		)
			.then((r) => {
				if (!r.ok) throw new Error("HTTP " + r.status);
				return r.json();
			})
			.catch((error) => {
				logError("Failed to fetch legacy handle batch:", error);
				return null;
			});
	}

	function createQuoteRequest(identifier) {
		const numericId = identifier.type === "id" ? identifier.value : null;
		const product = config.products.find(
			(item) =>
				item.handle === identifier.value ||
				(numericId && item.productGid.endsWith("/" + numericId)),
		);
		if (product) return product;
		if (!numericId) return null;
		return {
			productGid: "gid://shopify/Product/" + numericId,
			currencyCode: config.currencyCode,
		};
	}

	function mergeQuoteResponses(responses) {
		const products = {};

		for (const result of responses) {
			const quotes = result.response?.quotes || [];
			for (let index = 0; index < result.batch.length; index++) {
				const entry = result.batch[index];
				const quoteResult = quotes[index];
				if (!entry) continue;
				// Unavailable quotes are recorded rather than dropped: a dropped
				// identifier never enters the cache, so every DOM mutation re-quotes
				// it — on a collection page, that is most of the page, forever.
				if (quoteResult?.status !== "available") {
					products[entry.identifier.value] = { eligible: false };
					continue;
				}
				const presentation = createPresentationDiscount(
					quoteResult.quote,
					entry.request.handle,
				);
				// A quote we cannot format fails closed like an unavailable one, and
				// is recorded for the same reason: dropping it re-quotes it forever.
				products[entry.identifier.value] = presentation || { eligible: false };
			}
		}

		return products;
	}

	function createPresentationDiscount(quote, handle) {
		const savings = quote.originalPriceMinor - quote.discountedPriceMinor;
		const originalPrice = formatMoney(
			quote.originalPriceMinor,
			quote.currencyCode,
		);
		const discountedPrice = formatMoney(
			quote.discountedPriceMinor,
			quote.currencyCode,
		);
		// Fail closed rather than render a broken price string.
		if (!(originalPrice && discountedPrice)) return null;
		return {
			eligible: true,
			originalPrice,
			discountedPrice,
			percentage:
				quote.originalPriceMinor > 0
					? Math.round((savings / quote.originalPriceMinor) * 100)
					: 0,
			discountTitle: quote.discountTitle,
			source: "quote",
			handle,
			productGid: quote.productGid,
			priceVariantGid: quote.priceVariantGid,
		};
	}

	// Minor units per currency exponent (e.g. 2 for USD, 0 for JPY).
	function formatMoney(amountMinor, currencyCode) {
		try {
			const formatter = new Intl.NumberFormat(
				document.documentElement.lang || undefined,
				{ style: "currency", currency: currencyCode },
			);
			const exponent = formatter.resolvedOptions().maximumFractionDigits || 0;
			return formatter.format(amountMinor / 10 ** exponent);
		} catch {
			return null;
		}
	}

	function getProductIdentifier(element) {
		var id = element.getAttribute("data-product-id");
		if (id && /^\d+$/.test(id)) return { type: "id", value: id };

		var parentWithId = element.closest("[data-product-id]");
		if (parentWithId) {
			id = parentWithId.getAttribute("data-product-id");
			if (id && /^\d+$/.test(id)) return { type: "id", value: id };
		}

		var productLink =
			element.matches && element.matches('a[href*="/products/"]')
				? element
				: element.closest('a[href*="/products/"]');
		if (!productLink) {
			productLink = element.querySelector('a[href*="/products/"]');
		}

		if (productLink) {
			var match = productLink.href.match(/\/products\/([^?/]+)/);
			if (match && match[1]) return { type: "handle", value: match[1] };
		}

		return null;
	}

	// ─── Subscription purchase options ──────────────────────────────────────
	// A subscription line is priced by its selling plan, not by the automatic
	// discount, so a sale price shown beside a selected subscription reads as a
	// second discount stacked on the first. With the guard on, the sale price is
	// withheld while a subscription purchase option is selected, and the original
	// price is put back the moment the shopper returns to a one-time purchase.

	const SELLING_PLAN_FIELD_SELECTOR = '[name="selling_plan"]';
	const SUBSCRIPTION_SCOPE_SELECTOR =
		'form[action*="/cart/add"], product-info, .product-info, .product-form, ' +
		"li.grid__item, .product-card, .card-wrapper, .product-item";
	// Subscription widgets set the selling plan field programmatically, which
	// fires no event and mutates no attribute, so a click is re-read once the
	// widget has settled rather than only at the moment it happened.
	const PURCHASE_OPTION_SETTLE_MS = [50, 300, 1000];

	// Markup captured before a rewrite, so the guard can put the untouched price
	// back. A restored container drops its entry and is eligible to be written
	// again once the shopper switches back to a one-time purchase.
	const originalPriceMarkup = new Map();
	const watchedSubscriptionRoots = new WeakSet();
	let purchaseOptionListenersAttached = false;
	let purchaseOptionTimer = null;

	function isProductPagePath() {
		return window.location.pathname.includes("/products/");
	}

	// A product page sells one product under one purchase option, and the widget
	// that carries it sits outside the price markup, so the page is the scope.
	// Recommendation cards on that page are covered by the same answer, which
	// keeps every price on a subscribed page consistent with the one above it.
	// A collection page gets per-card scope instead: a quick-shop subscription in
	// one card must never withhold the price on every other card, so a card with
	// no widget of its own is simply never subscribed.
	function subscriptionScopeFor(priceContainer) {
		if (isProductPagePath()) return document;
		return priceContainer.closest(SUBSCRIPTION_SCOPE_SELECTOR);
	}

	function hasSellingPlanValue(field) {
		const value = (field.value || "").trim();
		return value !== "" && value !== "0";
	}

	function isSubscriptionSelected(scope) {
		if (!scope) return false;

		if (scope.querySelectorAll("og-offer[subscribed]").length > 0) return true;

		const fields = scope.querySelectorAll(SELLING_PLAN_FIELD_SELECTOR);
		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];
			const isToggle = field.type === "radio" || field.type === "checkbox";
			if (isToggle && !field.checked) continue;
			if (hasSellingPlanValue(field)) return true;
		}

		return false;
	}

	// Themes re-render their price markup on a variant change, which orphans the
	// container a snapshot was taken from. Dropping those keeps the map to the
	// prices actually on the page rather than every one the session has shown.
	function pruneDetachedMarkup() {
		originalPriceMarkup.forEach((_markup, priceContainer) => {
			if (!priceContainer.isConnected) {
				originalPriceMarkup.delete(priceContainer);
			}
		});
	}

	function rememberOriginalMarkup(priceContainer) {
		pruneDetachedMarkup();
		if (!originalPriceMarkup.has(priceContainer)) {
			originalPriceMarkup.set(priceContainer, priceContainer.innerHTML);
		}
	}

	function restorePriceContainer(priceContainer) {
		const markup = originalPriceMarkup.get(priceContainer);
		originalPriceMarkup.delete(priceContainer);
		if (markup === undefined || priceContainer.innerHTML === markup) {
			return false;
		}
		priceContainer.innerHTML = markup;
		return true;
	}

	function reconcileSubscriptionGuard() {
		let restored = 0;

		pruneDetachedMarkup();
		originalPriceMarkup.forEach((_markup, priceContainer) => {
			if (isSubscriptionSelected(subscriptionScopeFor(priceContainer))) {
				if (restorePriceContainer(priceContainer)) restored++;
			}
		});

		if (restored > 0) {
			log("Restored " + restored + " price(s) for a subscription purchase");
		}

		// Re-runs the normal pass so a switch back to a one-time purchase gets its
		// sale price again; activateSalePrice re-checks the guard for each one.
		replaceProductPrices();
	}

	function schedulePurchaseOptionReconcile() {
		clearTimeout(purchaseOptionTimer);
		purchaseOptionTimer = setTimeout(reconcileSubscriptionGuard, 150);
	}

	function attachPurchaseOptionListeners() {
		if (purchaseOptionListenersAttached) return;
		purchaseOptionListenersAttached = true;

		document.addEventListener("change", (event) => {
			const target = event.target;
			if (target?.matches?.(SELLING_PLAN_FIELD_SELECTOR)) {
				schedulePurchaseOptionReconcile();
			}
		});

		document.addEventListener("click", (event) => {
			if (!event.target?.closest?.("og-offer")) return;
			for (let i = 0; i < PURCHASE_OPTION_SETTLE_MS.length; i++) {
				setTimeout(reconcileSubscriptionGuard, PURCHASE_OPTION_SETTLE_MS[i]);
			}
		});
	}

	function watchPurchaseOptions(scope) {
		attachPurchaseOptionListeners();

		const root = scope && scope !== document ? scope : document.body;
		if (!root || watchedSubscriptionRoots.has(root)) return;
		watchedSubscriptionRoots.add(root);

		if (!window.MutationObserver) return;
		new MutationObserver(schedulePurchaseOptionReconcile).observe(root, {
			attributes: true,
			attributeFilter: ["subscribed"],
			subtree: true,
		});
	}

	function activateSalePrice(priceContainer, discount) {
		if (priceContainer.querySelector("." + MARKER_CLASS)) return false;

		if (config.subscriptionGuard) {
			const scope = subscriptionScopeFor(priceContainer);
			watchPurchaseOptions(scope);
			if (isSubscriptionSelected(scope)) {
				log("Subscription purchase option selected - withholding sale price");
				return false;
			}
		}
		rememberOriginalMarkup(priceContainer);

		const replaced = writeSalePrice(priceContainer, discount);
		if (!replaced) originalPriceMarkup.delete(priceContainer);
		return replaced;
	}

	function writeSalePrice(priceContainer, discount) {
		var saleDiv =
			queryFirst(priceContainer, config.selectors?.salePriceSelectors || []) ||
			priceContainer.querySelector(".price__sale");
		var regularDiv =
			queryFirst(
				priceContainer,
				config.selectors?.regularPriceSelectors || [],
			) || priceContainer.querySelector(".price__regular");

		if (isAlreadyOnSale(priceContainer, saleDiv)) return false;

		if (saleDiv && regularDiv) {
			if (applyNativeSalePrice(saleDiv, regularDiv, discount)) return true;
		}

		return createCustomSalePrice(priceContainer, discount);
	}

	// Every currency Shopify can price in, from the Admin API CurrencyCode enum
	// (2026-07) minus XXX (the "no currency" placeholder) and USDC (four letters,
	// which the trailing guard rejects anyway). No shared list exists to mirror —
	// app/lib/utils/money.util.ts derives exponents from Intl rather than
	// enumerating codes — so the set is spelled out here, and it stays closed on
	// purpose: a bare [A-Z]{3} reads "SAVE 20%" and "SKU 44821" as prices.
	var CURRENCY_CODE_PATTERN = (
		"AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT " +
		"BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD " +
		"CDF CHF CLP CNY COP CRC CVE CZK DJF DKK DOP DZD EGP " +
		"ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD " +
		"HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JEP JMD " +
		"JOD JPY KES KGS KHR KID KMF KRW KWD KYD KZT LAK LBP " +
		"LKR LRD LSL LTL LVL LYD MAD MDL MGA MKD MMK MNT MOP " +
		"MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD " +
		"OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF " +
		"SAR SBD SCR SDG SEK SGD SHP SLL SOS SRD SSP STN SYP " +
		"SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD " +
		"UYU UZS VED VES VND VUV WST XAF XCD XOF XPF YER ZAR " +
		"ZMW"
	)
		.split(" ")
		.join("|");

	// One amount, whichever separator convention the shop's money format uses:
	// "1,299.00" and "1.299,00" are both whole prices. Anchoring on a digit at
	// each end keeps a trailing sentence period out of the match.
	var AMOUNT_PATTERN = "\\d(?:[\\d,.]*\\d)?";

	// A code in front of a number only reads as a price when what follows the
	// number is not itself price-unlike. The full currency set includes codes that
	// are ordinary English words (ALL, TOP, TRY, PEN, MAD), so without this guard
	// "ALL 20% OFF" and "GEL 200ML" would be rewritten as prices. The guard
	// swallows the rest of the number itself, so backtracking to a shorter number
	// ("ALL 2" of "ALL 20%") cannot slip past it.
	// It also rejects a number that another number continues across a space, the
	// one grouping style AMOUNT_PATTERN cannot read: "EUR 1 299,00" would match
	// "EUR 1" and rewriteSingleElementPrice would strand " 299,00" beside the
	// price it wrote. Skipping the discount costs a sale; half a price is a lie.
	var NUMBER_TAIL_GUARD = "(?![\\d,.]*(?:[A-Za-z]|\\s*%|\\s\\d))";

	// A code after a number needs the mirror of NUMBER_TAIL_GUARD. An adjacent
	// letter means the code was part of a longer token ("20 USDT"); a lowercase
	// word one space on means it was prose all along ("The 10 TOP picks", which
	// createCustomSalePrice would otherwise hide as if it were the price).
	// Money is rendered into its own element by every theme's money filter, so a
	// price trailed by copy in the same text node is the rarer case, and losing
	// it only costs the discount.
	var CODE_TAIL_GUARD = "(?![A-Za-z]|\\s[a-z])";

	// A currency marker on one side is required: a bare number would match model
	// numbers, star ratings and SKUs and get rewritten as if it were a price.
	// A leading `\b` stops a code from matching inside a longer capitalised run
	// ("XUSD 20"); no lookbehind is used, so the pattern still runs on older
	// storefront browsers.
	var PRICE_TEXT_REGEX = new RegExp(
		"(?:[$€£¥₹₩₽]|\\b(?:" +
			CURRENCY_CODE_PATTERN +
			"))\\s?" +
			AMOUNT_PATTERN +
			NUMBER_TAIL_GUARD +
			"|" +
			AMOUNT_PATTERN +
			"\\s?(?:[$€£¥₹₩₽]|(?:" +
			CURRENCY_CODE_PATTERN +
			")" +
			CODE_TAIL_GUARD +
			")",
	);

	function isAlreadyOnSale(priceContainer, saleDiv) {
		var saleDivHidden = saleDiv && saleDiv.offsetParent === null;
		if (saleDiv && !saleDivHidden) {
			var existingStrike = saleDiv.querySelector("s, .price-item--regular");
			var existingSale = saleDiv.querySelector(".price-item--sale");
			if (existingStrike && existingSale) {
				log("Product already on sale, skipping");
				return true;
			}
		}

		var strikethroughElements = priceContainer.querySelectorAll(
			's, [style*="line-through"], .was-price, .compare-price, [class*="compare"]',
		);
		// Price shape, not mere presence: `[class*="compare"]` matches wrappers many
		// themes render unconditionally around a visually-hidden "Regular price"
		// label, and treating that as a sale would suppress the discount entirely.
		// Dawn renders its sale block on every product and hides it with CSS, so a
		// product with no compare-at carries `<s>$0.00</s>` there. Hidden, it is
		// not a sale.
		for (var i = 0; i < strikethroughElements.length; i++) {
			if (saleDivHidden && saleDiv.contains(strikethroughElements[i])) continue;
			if (PRICE_TEXT_REGEX.test(strikethroughElements[i].textContent || "")) {
				log("Detected existing sale price via strikethrough");
				return true;
			}
		}

		return false;
	}

	function applyNativeSalePrice(saleDiv, regularDiv, discount) {
		var strikethroughPrice = saleDiv.querySelector("s .price-item--regular, s");
		var salePrice = saleDiv.querySelector(".price-item--sale");

		if (!(strikethroughPrice && salePrice)) return false;

		strikethroughPrice.textContent = discount.originalPrice;
		salePrice.textContent = discount.discountedPrice;
		regularDiv.style.display = "none";
		saleDiv.style.display = "block";
		appendReplacementMetadata(saleDiv, discount, config.debugMode);

		return true;
	}

	function appendReplacementMetadata(element, discount, includeDebugIndicator) {
		if (!element.querySelector("." + MARKER_CLASS)) {
			element.appendChild(createReplacedMarker(discount));
			if (includeDebugIndicator)
				element.appendChild(createDebugIndicator(discount));
		}
	}

	function findPriceTextNode(container) {
		if (!container || typeof document.createTreeWalker !== "function")
			return null;

		var walker = document.createTreeWalker(
			container,
			NodeFilter.SHOW_TEXT,
			null,
		);

		var node = walker.nextNode();
		while (node) {
			if (node.parentNode && node.nodeValue) {
				var match = node.nodeValue.match(PRICE_TEXT_REGEX);
				if (match) {
					return { textNode: node, parent: node.parentNode, match: match };
				}
			}
			node = walker.nextNode();
		}

		return null;
	}

	function rewriteSingleElementPrice(priceContainer, found, discount) {
		var textNode = found.textNode;
		var parent = found.parent;
		if (!parent) return false;

		var text = textNode.nodeValue;
		var match = found.match;
		var start = match.index;
		var end = start + match[0].length;

		var beforeText = text.slice(0, start);
		var afterText = text.slice(end);

		var fragment = document.createDocumentFragment();
		if (beforeText) fragment.appendChild(document.createTextNode(beforeText));

		var strikeEl = document.createElement("s");
		strikeEl.textContent = discount.originalPrice;
		fragment.appendChild(strikeEl);
		fragment.appendChild(document.createTextNode(" "));

		var saleLabelEl = document.createElement("span");
		saleLabelEl.className = "visually-hidden";
		saleLabelEl.textContent = "Sale price";
		fragment.appendChild(saleLabelEl);
		fragment.appendChild(document.createTextNode(" "));

		var saleEl = document.createElement("span");
		saleEl.className = "sale-price";
		saleEl.textContent = discount.discountedPrice;
		fragment.appendChild(saleEl);

		if (afterText) fragment.appendChild(document.createTextNode(afterText));

		parent.replaceChild(fragment, textNode);

		appendReplacementMetadata(priceContainer, discount, config.debugMode);

		return true;
	}

	function createCustomSalePrice(priceContainer, discount) {
		if (priceContainer.querySelector("." + MARKER_CLASS)) return false;

		var originalPriceElement = priceContainer.querySelector(
			".price-item--regular, .price-item, .money",
		);
		if (!originalPriceElement) {
			originalPriceElement = priceContainer.querySelector(
				'[class*="price"], [class*="amount"], .money, span:not([class])',
			);
		}
		if (!originalPriceElement) {
			var allElements = priceContainer.querySelectorAll("*");
			for (var i = 0; i < allElements.length; i++) {
				if (
					allElements[i].textContent &&
					PRICE_TEXT_REGEX.test(allElements[i].textContent) &&
					!allElements[i].querySelector("*")
				) {
					originalPriceElement = allElements[i];
					break;
				}
			}
		}

		log("Looking for price element in container:", priceContainer.className);
		if (!originalPriceElement) {
			// Single-element markup fallback: the price lives as a raw text node
			// (e.g. `<p><span class="visually-hidden">Regular price</span> $249.99</p>`)
			var priceTextNode = findPriceTextNode(priceContainer);
			if (priceTextNode) {
				log("Rewriting single-element price text node in place");
				return rewriteSingleElementPrice(
					priceContainer,
					priceTextNode,
					discount,
				);
			}
			log("No price element found in container");
			return false;
		}

		var saleWrapper = document.createElement("div");
		saleWrapper.className = "sale-sight-sale-price";

		var strikeSpan = document.createElement("span");
		strikeSpan.style.cssText =
			"text-decoration:line-through;color:#6b7280;margin-right:8px;font-size:14px;";
		strikeSpan.textContent = discount.originalPrice;

		var priceSpan = document.createElement("span");
		priceSpan.style.cssText = "font-size:14px;";
		priceSpan.textContent = discount.discountedPrice;

		saleWrapper.appendChild(strikeSpan);
		saleWrapper.appendChild(priceSpan);
		appendReplacementMetadata(
			saleWrapper,
			discount,
			config.debugMode && discount.source,
		);

		originalPriceElement.style.display = "none";
		priceContainer.appendChild(saleWrapper);

		return true;
	}

	// Prices can depend on who is logged in. A theme that logs shoppers in
	// without a page load names the event it fires, and every painted price is
	// put back and requested again for the new shopper.
	function refreshPrices() {
		pricingGeneration++;
		pruneDetachedMarkup();
		originalPriceMarkup.forEach((_markup, priceContainer) => {
			restorePriceContainer(priceContainer);
		});
		processedIdentifiers.clear();
		discountDataCache.clear();
		log("Refreshing prices for the current shopper");
		replaceProductPrices();
	}

	let refreshTimer = null;
	function scheduleRefresh() {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(refreshPrices, 150);
	}

	if (config.enabled) {
		window.SaleSight.refresh = scheduleRefresh;
		for (const eventName of config.refreshEvents) {
			window.addEventListener(eventName, scheduleRefresh);
			document.addEventListener(eventName, scheduleRefresh);
		}
	}

	function setupProductObserver() {
		if (!window.MutationObserver) return;

		var debounceTimer = null;
		var observer = new MutationObserver((mutations) => {
			var newProductsFound = false;

			for (var m = 0; m < mutations.length; m++) {
				var addedNodes = mutations[m].addedNodes;
				for (var n = 0; n < addedNodes.length; n++) {
					var node = addedNodes[n];
					if (node.nodeType !== 1) continue;
					if (
						(node.matches && node.matches(PRODUCT_SELECTOR)) ||
						(node.querySelector && node.querySelector(PRODUCT_SELECTOR))
					) {
						newProductsFound = true;
						break;
					}
				}
				if (newProductsFound) break;
			}

			if (newProductsFound) {
				log("Detected new products loaded via AJAX, re-processing...");
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(replaceProductPrices, 300);
			}
		});

		observer.observe(getMainContent(), { childList: true, subtree: true });
		log("MutationObserver set up");
	}

	async function initializeSaleSight() {
		if (!config.enabled) return;
		log("Initializing:", config);

		var identifiers = collectIdentifiers();

		var uncached = getUncachedIdentifiers(
			identifiers.productIds,
			identifiers.productHandles,
		);

		if (uncached.ids.length === 0 && uncached.handles.length === 0) {
			log("No product identifiers found on page");
			setupProductObserver();
			return;
		}

		log(
			"Found " +
				uncached.ids.length +
				" IDs and " +
				uncached.handles.length +
				" handles",
		);

		const generation = pricingGeneration;
		var realDiscountData = await fetchRealDiscountData(
			uncached.ids,
			uncached.handles,
		);
		if (generation !== pricingGeneration) {
			setupProductObserver();
			return;
		}

		if (!realDiscountData?.data?.products) {
			log("Failed to fetch real discount data");
			setupProductObserver();
			return;
		}

		await ensureSelectors(realDiscountData);
		cacheDiscountData(realDiscountData);
		const appliedIdentifiers = applyDiscountData(realDiscountData, identifiers);
		markIdentifiersProcessed(appliedIdentifiers);
		setupProductObserver();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initializeSaleSight, {
			once: true,
		});
	} else {
		initializeSaleSight();
	}
})();
