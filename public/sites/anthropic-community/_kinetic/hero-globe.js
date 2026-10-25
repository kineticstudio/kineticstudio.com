/* Kinetic's hero for the Claude Community page, with its globe, and the globe
   spins when you drag it.

   The live page (claude.com/community) has since replaced Kinetic's globe with
   a hand-drawn illustration and new hero copy. This copy puts Kinetic's version
   back, as Kinetic's own recordings show it (claude-community-globe.mp4, March
   2026) and as the work card rebuilds it: "Join the Claude Community to share
   solutions, help each other, and push the boundaries of what's possible with
   AI. Keep thinking." and "Join the waitlist" on the left, the dotted globe of
   the cities the community meets in rising from the bottom right, with its
   "2 upcoming events" tip riding a city.

   The globe is the work card's engine (globe.js, globe-data.js: one canvas, a
   minimal WebGL, a 2D fallback). Here it runs on its own clock: a slow turn,
   and press and drag turns it with the hand (up and down tilts it a little,
   springing back), let go and it coasts on with momentum, then eases back into
   the slow turn. The dots under the pointer swell, as on Kinetic's page.

   It waits for React to hydrate the hero, then changes only what React will not
   touch again (the hero's two text nodes, and its own layer). Nothing here
   leaves the page. window.__kcGlobe is the handle (the scroll-loop recorder
   reads where the globe is from it). */
(function () {
  'use strict';
  var S = 1440 / 1312;                    // the card's column to this page's
  var BODY = 'Join the Claude Community to share solutions,<br>help each other, and push the boundaries of what’s<br>possible with AI. Keep thinking.';
  var CTA = 'Join the waitlist';
  // the globe, as the card fits it to Kinetic's recording, in this page's px (section coordinates)
  var BOX = { x: 440, y: 548 };           // the canvas: from here to the hero's right and bottom edges
  var CX = 80 + (1055 - 64) * S;          // the sphere's centre and outline radius, on the page
  var CY = 240 + (1065 - 223) * S;
  var RS = 560 * S;
  var VIEW = { d: 3.0, phi: 18.5, lam: -82 };
  var TIPS = ['Toronto', 'Austin', 'Miami'];
  var IDLE = 4.2;                         // deg/s, the slow turn
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  function hydrated(el) {
    for (var k in el) if (k.indexOf('__reactFiber') === 0 || k.indexOf('__reactProps') === 0) return true;
    return false;
  }
  function whenReady(fn) {
    var t0 = performance.now();
    (function poll() {
      var h1 = document.querySelector('[class*="HeroIllustrationStagger-module"][class*="__headline"]');
      // hydrated, or 6 s in (a page that never hydrates still gets its hero)
      if (h1 && (hydrated(h1) || performance.now() - t0 > 6000)) return setTimeout(fn, 0);
      setTimeout(poll, 30);
    })();
  }

  function heroText(sec) {
    var p = sec.querySelector('[class*="HeroIllustrationStagger-module"][class*="__subheadline"]');
    if (p) p.innerHTML = BODY;
    var a = sec.querySelector('[class*="HeroIllustrationStagger-module"][class*="__ctas"] a');
    if (a) {
      a.querySelectorAll('[class*="__icon"], .sr-only').forEach(function (n) { n.remove(); });
      a.className = a.className.replace(/\S*hasTrailingIcon\S*/g, '');
      a.removeAttribute('target');
      for (var n = a.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.data.trim()) { n.data = CTA; return; }
      a.insertBefore(document.createTextNode(CTA), a.firstChild);
    }
  }

  function init() {
    var sec = document.querySelector('[class*="HeroIllustrationStagger-module"][class*="__hero"]');
    if (!sec || sec.classList.contains('kc-hero')) return;
    heroText(sec);
    sec.classList.add('kc-hero');

    var rule = document.createElement('i');
    rule.className = 'kc-rule';
    var layer = document.createElement('div');
    layer.className = 'kc-globe';
    layer.setAttribute('role', 'img');
    layer.setAttribute('aria-label', 'A globe of the cities the Claude Community meets in; drag to turn it');
    var canvas = document.createElement('canvas');
    var tip = document.createElement('div');
    tip.className = 'kc-tip';
    tip.innerHTML = '<div class="kc-tip-pill">2 upcoming events</div><div class="kc-tip-city"></div>';
    var tipCity = tip.lastChild;
    layer.appendChild(canvas);
    layer.appendChild(tip);
    sec.appendChild(rule);
    sec.appendChild(layer);

    if (!window.ACGlobe) return;
    var globe = window.ACGlobe.create(canvas, { dotSize: 2.8 * S, markerSize: 6.1 * S, hoverRadius: 135 * S, mirror: true });
    var tipCities = TIPS.map(function (n) { return globe.cities.find(function (c) { return c[0] === n; }); }).filter(Boolean);

    var W = 0, H = 0, q = 1;
    function layout() {
      var w = sec.clientWidth, h = sec.clientHeight;
      W = Math.max(1, w - BOX.x); H = Math.max(1, h - BOX.y);
      layer.style.left = BOX.x + 'px'; layer.style.top = BOX.y + 'px';
      layer.style.width = W + 'px'; layer.style.height = H + 'px';
      q = Math.min(2, window.devicePixelRatio || 1);
      globe.resize(W, H, q);
      globe.setView({ cx: CX - BOX.x, cy: CY - BOX.y, rs: RS, d: VIEW.d, phi: VIEW.phi });
      globe.setFade(H - 150, H);
      dirty = true;
    }

    // the turn: lam (deg) and a little tilt (phi), with the hand, momentum and the slow turn
    var lam = VIEW.lam, phi = VIEW.phi, vLam = -IDLE, vPhi = 0;
    var drag = null, samples = [], dirty = true;
    var ptr = { x: -1e5, y: -1e5, amt: 0 }, ptrTarget = 0, inside = false;
    // which way the surface moves on screen as lam grows (so the globe follows the hand)
    var sign = (function () {
      globe.setView({ cx: CX - BOX.x, cy: CY - BOX.y, rs: RS, d: VIEW.d, phi: VIEW.phi, lam: VIEW.lam });
      var p0 = globe.project(VIEW.phi, VIEW.lam);
      globe.setView({ lam: VIEW.lam + 1 });
      var p1 = globe.project(VIEW.phi, VIEW.lam);
      globe.setView({ lam: VIEW.lam });
      return p1.x - p0.x >= 0 ? 1 : -1;
    })();
    // degrees of turn per px of hand at the front of the sphere
    var DEG_PX = (180 / Math.PI) / RS;

    function local(e) {
      var r = layer.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    }
    function onSphere(p) {
      var dx = p.x - (CX - BOX.x), dy = p.y - (CY - BOX.y);
      return dx * dx + dy * dy < (RS * 1.04) * (RS * 1.04);
    }
    layer.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var p = local(e);
      if (!onSphere(p)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lam: lam, phi: phi };
      samples = [[e.timeStamp, lam, phi]];
      vLam = 0; vPhi = 0;
      layer.classList.add('is-dragging');
      try { layer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    layer.addEventListener('pointermove', function (e) {
      var p = local(e);
      ptr.x = p.x; ptr.y = p.y;
      inside = onSphere(p);
      if (!drag || e.pointerId !== drag.id) return;
      lam = drag.lam + sign * (e.clientX - drag.x) * DEG_PX;
      phi = clamp(drag.phi + (e.clientY - drag.y) * DEG_PX * 0.5, VIEW.phi - 14, VIEW.phi + 14);
      samples.push([e.timeStamp, lam, phi]);
      if (samples.length > 12) samples.shift();
      dirty = true;
    });
    function release(e) {
      if (!drag || e.pointerId !== drag.id) return;
      // momentum: the speed over the last tenth of a second, if the hand was still moving when it let go
      var t = e.timeStamp, recent = samples.filter(function (s) { return t - s[0] < 110; });
      if (recent.length > 1 && t - recent[recent.length - 1][0] < 80) {
        var a = recent[0], b = recent[recent.length - 1], dt = (b[0] - a[0]) / 1000;
        if (dt > 0) { vLam = clamp((b[1] - a[1]) / dt, -720, 720); vPhi = clamp((b[2] - a[2]) / dt, -120, 120); }
      }
      drag = null;
      layer.classList.remove('is-dragging');
    }
    layer.addEventListener('pointerup', release);
    layer.addEventListener('pointercancel', release);
    layer.addEventListener('pointerleave', function () { if (!drag) inside = false; });

    // the tip: on the labelled city nearest the front, fading as it turns away or leaves the hero
    var tipShown = null, tipA = 0, lastTip = '', lastOp = '';
    function tipStep(dt) {
      var B = globe.basis(), best = null, bestScore = 0.18;
      var rect = layer.getBoundingClientRect(), vh = innerHeight;
      var scoreOf = function (c) {
        var p = globe.project(c[1], c[2], B);
        var sy = rect.top + p.y * (rect.height / H);
        var inFrame = clamp((vh - 40 - sy) / 40, 0, 1) * clamp((H - 60 - p.y) / 60, 0, 1) * clamp((W - 120 - p.x) / 60, 0, 1) * clamp((p.x - 120) / 60, 0, 1);
        return { p: p, v: clamp((p.front - 0.2) / 0.25, 0, 1) * inFrame };
      };
      var show = function (c) { tipShown = c; tipCity.textContent = c[0]; };
      tipCities.forEach(function (c) {
        var r = scoreOf(c), sc = r.v + (c === tipShown ? 0.25 : 0);
        if (r.v > 0.05 && sc > bestScore) { bestScore = sc; best = c; }
      });
      if (!tipShown && best) show(best);
      var target = 0, pos = null;
      if (tipShown) { var r = scoreOf(tipShown); pos = r.p; target = best === tipShown ? r.v : 0; }
      tipA += (target - tipA) * (1 - Math.exp(-dt / 0.14));
      if (tipA < 0.02 && best && best !== tipShown) show(best);
      if (pos) {
        var s = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0)';
        if (s !== lastTip) { tip.style.transform = s; lastTip = s; }
      }
      var op = tipA.toFixed(3);
      if (op !== lastOp) { tip.style.opacity = op; lastOp = op; }
    }

    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(layer);
    }
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        var idle = reduced && reduced.matches ? 0 : -IDLE;
        if (!drag) {
          // momentum eases back into the slow turn; the tilt springs back level
          vLam = idle + (vLam - idle) * Math.exp(-dt / 1.1);
          lam += vLam * dt;
          vPhi += ((VIEW.phi - phi) * 26 - vPhi * 9) * dt;
          phi += vPhi * dt;
        }
        ptrTarget = (inside || drag) ? 1 : 0;
        ptr.amt += (ptrTarget - ptr.amt) * (1 - Math.exp(-dt / 0.18));
        globe.setView({ phi: phi });
        globe.draw({ lam: lam, pointer: ptr.amt > 0.01 ? ptr : { x: -1e5, y: -1e5, amt: 0 } });
        tipStep(dt);
        dirty = false;
      }
      requestAnimationFrame(frame);
    }
    layout();
    addEventListener('resize', layout);
    requestAnimationFrame(frame);

    window.__kcGlobe = {
      layer: layer,
      // the sphere's centre and radius in client px, for a scripted drag
      sphere: function () {
        var r = layer.getBoundingClientRect(), k = r.width / W;
        return { x: r.left + (CX - BOX.x) * k, y: r.top + (CY - BOX.y) * k, r: RS * k };
      },
      get lam() { return lam; },
      get webgl() { return globe.webgl; },
    };
  }

  whenReady(init);
})();
