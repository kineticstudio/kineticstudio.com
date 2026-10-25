/* Wispr FAQ: existing Webflow markup, desktop >= 768px, mobile accordion. */
(function () {
  'use strict';

  // Finish even when no height transition exists or both heights are equal.
  // Return a cancellation function so old animations cannot overwrite new state.
  function afterHeightTransition(element, complete) {
    const styles = getComputedStyle(element);
    const milliseconds = (value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
    const durations = styles.transitionDuration.split(',').map(milliseconds);
    const delays = styles.transitionDelay.split(',').map(milliseconds);
    const properties = styles.transitionProperty.split(',').map((value) => value.trim());
    const duration = Math.max(0, ...properties.map((property, index) =>
      property === 'height' || property === 'all'
        ? durations[index % durations.length] + delays[index % delays.length] : 0));
    let timer;
    function cancel() {
      clearTimeout(timer);
      element.removeEventListener('transitionend', onEnd);
    }
    function finish() { cancel(); complete(); }
    function onEnd(event) {
      if (event.target === element && event.propertyName === 'height') finish();
    }
    element.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, duration > 0 ? duration + 50 : 0);
    return cancel;
  }

  function initialize(root) {
    const BREAKPOINT = 768;
    const faqItems = root.querySelectorAll('[faq-item]');
    const answerWrap = root.querySelector('[faq-answer-wrap]');
    if (!faqItems.length || root.hasAttribute('data-wispr-faq-ready')) return;
    root.setAttribute('data-wispr-faq-ready', '');
    let swapTimer;
    let finishDesktop = () => {};
    const mobileFinishes = new WeakMap();

    const targetQuestion = answerWrap ? answerWrap.querySelector('[faq-question]') : null;
    const targetAnswer = answerWrap ? answerWrap.querySelector('[faq-answer]') : null;

    function isDesktop() {
      return window.innerWidth >= BREAKPOINT;
    }

    /* ---------- Scroll gradients (desktop only) ---------- */
    const GRADIENT_THRESHOLD = 4;

    function setupScrollGradients(scrollSelector, topSelector, bottomSelector) {
      const scrollWrap = root.querySelector(scrollSelector);
      const topGradient = root.querySelector(topSelector);
      const bottomGradient = root.querySelector(bottomSelector);

      function update() {
        if (!scrollWrap || !topGradient || !bottomGradient) return;

        if (!isDesktop()) {
          topGradient.style.opacity = '0';
          bottomGradient.style.opacity = '0';
          return;
        }

        const { scrollTop, scrollHeight, clientHeight } = scrollWrap;
        const isScrollable = scrollHeight > clientHeight + GRADIENT_THRESHOLD;

        if (!isScrollable) {
          topGradient.style.opacity = '0';
          bottomGradient.style.opacity = '0';
          return;
        }

        const atTop = scrollTop <= GRADIENT_THRESHOLD;
        const atBottom = scrollTop + clientHeight >= scrollHeight - GRADIENT_THRESHOLD;

        topGradient.style.opacity = atTop ? '0' : '1';
        bottomGradient.style.opacity = atBottom ? '0' : '1';
      }

      if (scrollWrap) {
        scrollWrap.addEventListener('scroll', update);
      }
      update(); // run once on load

      return update;
    }

    const updateQuestionGradients = setupScrollGradients('.faq_ques-list', '.faq_ques-top-gradient', '.faq_ques-bottom-gradient');

    const updateAnswerGradients = setupScrollGradients('.faq_ans-wrap', '.faq_ans-top-gradient', '.faq_ans-bottom-gradient');

    /* ---------- Desktop: swap content into shared answer wrap ---------- */
    function activateItem(item, instant) {
      const sourceQuestion = item.querySelector('[faq-question]');
      const sourceAnswer = item.querySelector('[faq-answer]');
      if (!targetAnswer) return;

      const answerBox = targetAnswer.closest('.faq_ans-div');
      const wrap = targetAnswer.closest('.faq_ans-wrap');

      function swapContent() {
        if (sourceQuestion && targetQuestion) {
          targetQuestion.textContent = sourceQuestion.textContent;
        }
        if (sourceAnswer) {
          targetAnswer.innerHTML = sourceAnswer.innerHTML;
        }
        faqItems.forEach((el) => el.classList.remove('is-active'));
        item.classList.add('is-active');
      }

      if (instant || !wrap || !answerBox) {
        swapContent();
        updateAnswerGradients();
        return;
      }

      clearTimeout(swapTimer);
      finishDesktop();
      const startHeight = answerBox.scrollHeight;
      answerBox.style.height = startHeight + 'px';
      answerBox.style.overflow = 'hidden';

      wrap.classList.add('is-hidden');

      swapTimer = setTimeout(() => {
        swapContent();

        answerBox.style.height = 'auto';
        const endHeight = answerBox.scrollHeight;
        answerBox.style.height = startHeight + 'px';
        void answerBox.offsetHeight;

        answerBox.style.height = endHeight + 'px';
        wrap.classList.remove('is-hidden');

        finishDesktop = afterHeightTransition(answerBox, () => {
          answerBox.style.height = 'auto';
          answerBox.style.overflow = '';
          updateAnswerGradients();
        });
      }, 200);
    }

    /* ---------- Mobile: per-item accordion ---------- */
    function setMobileItem(item, open) {
      const arrow = item.querySelector('.faq_arrow-wrap');
      const hidden = item.querySelector('.faq_ans-hidden-wrap');
      item.classList.toggle('is-active', open);
      if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
      if (!hidden) return;

      const cancel = mobileFinishes.get(hidden);
      if (cancel) cancel();
      const startHeight = hidden.getBoundingClientRect().height;
      hidden.style.display = 'block';
      hidden.style.height = startHeight + 'px';
      void hidden.offsetHeight;
      hidden.style.height = open ? hidden.scrollHeight + 'px' : '0px';
      mobileFinishes.set(hidden, afterHeightTransition(hidden, () => {
        hidden.style.height = open ? 'auto' : '0px';
        hidden.style.display = open ? 'block' : 'none';
        mobileFinishes.delete(hidden);
      }));
    }

    function openItem(item) { setMobileItem(item, true); }
    function closeItem(item) { setMobileItem(item, false); }

    function toggleMobileItem(item) {
      const wasActive = item.classList.contains('is-active');
      faqItems.forEach((el) => {
        if (el !== item && el.classList.contains('is-active')) closeItem(el);
      });
      wasActive ? closeItem(item) : openItem(item);
    }

    /* ---------- Click routing ---------- */
    faqItems.forEach((item) => {
      item.addEventListener('click', (event) => {
        // Rich-text links and answer selection must not toggle the accordion.
        if (event.target.closest('.faq_ans-hidden-wrap')) return;
        if (isDesktop()) {
          activateItem(item);
        } else {
          toggleMobileItem(item);
        }
      });
    });

    function resetMode() {
      clearTimeout(swapTimer);
      finishDesktop();
      if (targetAnswer) {
        const box = targetAnswer.closest('.faq_ans-div');
        const wrap = targetAnswer.closest('.faq_ans-wrap');
        if (box) { box.style.height = ''; box.style.overflow = ''; }
        if (wrap) wrap.classList.remove('is-hidden');
      }
      faqItems.forEach((item) => {
        item.classList.remove('is-active');
        const arrow = item.querySelector('.faq_arrow-wrap');
        const hidden = item.querySelector('.faq_ans-hidden-wrap');
        if (arrow) arrow.style.transform = '';
        if (hidden) {
          const cancel = mobileFinishes.get(hidden);
          if (cancel) cancel();
          mobileFinishes.delete(hidden);
          hidden.style.display = '';
          hidden.style.height = '';
        }
      });
      if (isDesktop()) activateItem(faqItems[0], true);
    }

    resetMode();
    let wasDesktop = isDesktop();
    window.addEventListener('resize', () => {
      const nowDesktop = isDesktop();
      if (nowDesktop !== wasDesktop) resetMode();
      wasDesktop = nowDesktop;
      updateQuestionGradients();
      updateAnswerGradients();
    });
    window.addEventListener('load', () => {
      updateQuestionGradients();
      updateAnswerGradients();
    }, { once: true });
  }

  function start() {
    const roots = document.querySelectorAll('.faq_wrap');
    if (!Array.from(roots).some((root) => root.querySelector('[faq-item]'))) return;
    if (!document.getElementById('wispr-faq-styles')) {
      const style = document.createElement('style');
      style.id = 'wispr-faq-styles';
      style.textContent = `.faq_wrap .faq_ans-hidden-wrap {
    display: none;
    height: 0px;
  }
  .faq_wrap .faq_ques-top-gradient,
  .faq_wrap .faq_ques-bottom-gradient,
  .faq_wrap .faq_ans-bottom-gradient,
  .faq_wrap .faq_ans-top-gradient {
    opacity: 0;
    transition: opacity 350ms ease;
  }
  .faq_wrap .faq_ques-list::-webkit-scrollbar,
  .faq_wrap .faq_ans-wrap::-webkit-scrollbar {
    width: 25px;
    background: transparent;
  }
  .faq_wrap .faq_ques-list::-webkit-scrollbar-track,
  .faq_wrap .faq_ans-wrap::-webkit-scrollbar-track {
    background: transparent;
  }
  .faq_wrap .faq_ques-list::-webkit-scrollbar-corner,
  .faq_wrap .faq_ans-wrap::-webkit-scrollbar-corner {
    background: transparent;
  }
  .faq_wrap .faq_ques-list::-webkit-scrollbar-thumb {
    background-color: rgba(26, 26, 26, 0.5);
    border-radius: 100px;
    border: 10px solid transparent;
    background-clip: padding-box;
  }
  .faq_wrap .faq_ans-wrap::-webkit-scrollbar-thumb {
    background-color: rgba(26, 26, 26, 0.1);
    border-radius: 100px;
    border: 10px solid transparent;
    background-clip: padding-box;
  }`;
      document.head.appendChild(style);
    }
    roots.forEach(initialize);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
