/* Epirus homepage, round two: what the redesign's pages share (the footage
   that plays while on screen, the bar above the navigation, the film player,
   the statement's line breaks). */
(function () {
  'use strict';
  var root = document.documentElement;

  /* Their statement paragraph is split into lines by SplitType while the page
     is still parsing, sometimes before Inter has arrived, which leaves broken
     line breaks once it does (the live site has the same race). Split it
     again once the fonts are in. */
  /* Round two's footage (video[data-play="view"]): each clip loads and plays
     only while it is on screen, and holds its poster frame for reduced
     motion, so a page of real footage stays light. */
  document.addEventListener('DOMContentLoaded', function () {
    var clips = document.querySelectorAll('video[data-play="view"]');
    if (!clips.length) return;
    var still = function () {
      return root.getAttribute('data-motion') === 'still' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };
    var play = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
    /* A clip with a playhead (.r2b-playhead beside it) shows how much of it
       has played, as --played from 0 to 1, updated every frame it plays. */
    document.querySelectorAll('.r2b-playhead').forEach(function (bar) {
      var v = bar.parentElement.querySelector('video');
      if (!v) return;
      var raf = 0;
      var set = function () { if (v.duration) bar.style.setProperty('--played', (v.currentTime / v.duration).toFixed(4)); };
      var tick = function () { set(); raf = v.paused ? 0 : requestAnimationFrame(tick); };
      v.addEventListener('playing', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
      v.addEventListener('pause', function () { cancelAnimationFrame(raf); set(); });
    });
    if (!('IntersectionObserver' in window)) { if (!still()) clips.forEach(play); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && !still()) play(e.target); else e.target.pause(); });
    }, { rootMargin: '200px 0px' });
    clips.forEach(function (v) { io.observe(v); });
  });

  /* A bar at the top of the page (.r2-topbar) sits above their fixed
     navigation, which rides down under it until the bar scrolls away;
     --r2-topbar-h lets the hero below keep to one screen. */
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.querySelector('.r2-topbar');
    var navs = document.querySelectorAll('.navbar_component');
    if (!bar || !navs.length) return;
    var h = 0;
    var place = function () {
      var top = Math.max(0, h - window.scrollY) + 'px';
      navs.forEach(function (nav) { nav.style.top = top; });
    };
    var measure = function () { h = bar.offsetHeight; root.style.setProperty('--r2-topbar-h', h + 'px'); place(); };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', place, { passive: true });
  });

  /* Round four's films: anything with data-film opens Epirus's film (a
     YouTube id, or since round six a film file of their own, played here
     with its controls) in a player over the page; the close button, a click
     outside it or Escape ends it, and focus goes back where it was. Opened
     from the hero's corner clip, the clip itself grows into the player
     (its picture carried along, still playing) and the film takes over
     once it has landed; closing shrinks it back into the corner (Hunter,
     7 October: fluid). From a button, the player rises in place. Reduced
     motion opens and closes it at once. */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-film]');
    if (!trigger || document.querySelector('.r4-player')) return;
    e.preventDefault();
    var back = document.activeElement;
    var calm = root.getAttribute('data-motion') === 'still' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var clip = trigger.querySelector('video');
    var from = trigger.querySelector('.r4-thumb-media') || trigger;
    var src = trigger.getAttribute('data-film');
    var own = /\.mp4(\?|$)/.test(src);
    var id = encodeURIComponent(src);
    var box = document.createElement('div');
    box.className = 'r4-player';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Epirus film');
    box.innerHTML = '<div class="r4-player-frame"><div class="r4-player-stand" aria-hidden="true"></div></div>' +
      '<button type="button" class="r4-player-close" aria-label="Close the film"><span aria-hidden="true"></span></button>';
    var frame = box.querySelector('.r4-player-frame');
    // the clip's own picture rides inside the frame while it grows
    if (clip) {
      var copy = clip.cloneNode(true);
      copy.removeAttribute('class');
      copy.muted = true;
      copy.addEventListener('loadedmetadata', function () { try { copy.currentTime = clip.currentTime; } catch (x) {} });
      box.querySelector('.r4-player-stand').appendChild(copy);
      var p = copy.play && copy.play();
      if (p && p.catch) p.catch(function () {});
    }
    var film = function () {
      if (frame.querySelector('iframe, .r4-player-video')) return;
      if (own) {
        var v = document.createElement('video');
        v.className = 'r4-player-video';
        v.src = src;
        v.controls = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.addEventListener('playing', function () { box.classList.add('is-playing'); });
        setTimeout(function () { box.classList.add('is-playing'); }, 2500);
        frame.appendChild(v);
        var go = v.play();
        if (go && go.catch) go.catch(function () { box.classList.add('is-playing'); });
        return;
      }
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.title = 'Epirus film';
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      f.setAttribute('allowfullscreen', '');
      var shown = function () { box.classList.add('is-playing'); };
      f.addEventListener('load', function () { setTimeout(shown, 250); });
      setTimeout(shown, 2500);
      frame.appendChild(f);
    };
    document.body.appendChild(box);
    root.classList.add('r4-has-player');
    // where the frame sits when open, and the move that lays it over the clip
    var to = frame.getBoundingClientRect();
    var over = function (r) {
      return 'translate(' + (r.left - to.left) + 'px, ' + (r.top - to.top) + 'px) scale(' + (r.width / to.width) + ', ' + (r.height / to.height) + ')';
    };
    if (calm) {
      box.classList.add('is-open');
      film();
    } else {
      // lay it over the clip without a transition, then let it grow
      frame.style.transition = 'none';
      if (clip) {
        frame.style.transform = over(from.getBoundingClientRect());
        trigger.classList.add('is-lifted');
      } else frame.classList.add('is-low');
      frame.getBoundingClientRect();
      frame.style.transition = '';
      requestAnimationFrame(function () {
        box.classList.add('is-open');
        frame.classList.remove('is-low');
        frame.style.transform = '';
      });
      setTimeout(film, 620);
    }
    var closing = false;
    var close = function () {
      if (closing) return;
      closing = true;
      document.removeEventListener('keydown', key);
      var done = function () {
        box.remove();
        root.classList.remove('r4-has-player');
        trigger.classList.remove('is-lifted');
        if (back && back.focus) back.focus({ preventScroll: true });
      };
      if (calm) return done();
      // the film stops at once; the clip's picture shrinks back home
      var f = frame.querySelector('iframe, .r4-player-video');
      if (f) { if (f.pause) f.pause(); f.remove(); }
      box.classList.remove('is-playing', 'is-open');
      if (clip) frame.style.transform = over(from.getBoundingClientRect());
      else frame.classList.add('is-low');
      setTimeout(done, 620);
    };
    var key = function (k) { if (k.key === 'Escape') close(); };
    box.addEventListener('click', function (c) { if (c.target === box || c.target.closest('.r4-player-close')) close(); });
    document.addEventListener('keydown', key);
    box.querySelector('.r4-player-close').focus({ preventScroll: true });
  });

  window.addEventListener('load', function () {
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(function () {
      try {
        if (typeof runSplitType === 'function' && typeof typeSplit !== 'undefined' && typeSplit) {
          typeSplit.revert();
          runSplitType();
        }
      } catch (e) {}
    });
  });
})();
