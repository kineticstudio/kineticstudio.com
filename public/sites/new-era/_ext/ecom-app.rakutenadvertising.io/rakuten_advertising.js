setTimeout(function () {
	if (window.location.href.toLowerCase().endsWith('cmp-status')) {
		fetch('https://ecom-app-api.rakutenadvertising.io/api/v1/cmp/status', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
			},
			body: JSON.stringify({ shop: Shopify.shop, status: typeof __uspapi === 'function' ? '1' : '0' }),
		});
	}
}, 6000);
