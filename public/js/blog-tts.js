(function () {
  if (!window.speechSynthesis) return;

  var LANG_MAP = { en: 'en-CA', fr: 'fr-FR', es: 'es-ES' };

  var UI_LABELS = {
    en: { listen: 'Listen',   pause: 'Pause',  resume: 'Resume',   stop: 'Stop',    aria: 'Listen to this article' },
    fr: { listen: 'Écouter',  pause: 'Pause',  resume: 'Reprendre',stop: 'Arrêter', aria: 'Écouter cet article' },
    es: { listen: 'Escuchar', pause: 'Pausar', resume: 'Reanudar', stop: 'Detener', aria: 'Escuchar este artículo' }
  };

  var state = 'idle';
  var keepAliveTimer = null;

  function getSiteLang() {
    return localStorage.getItem('sma-lang') || 'en';
  }

  function getVoiceLang() {
    return LANG_MAP[getSiteLang()] || 'en-CA';
  }

  function getLabels() {
    return UI_LABELS[getSiteLang()] || UI_LABELS.en;
  }

  function nodeText(el) {
    return (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  }

  function getProseText() {
    var sections = [];

    // 1. Title — first h1 on the page (outside prose)
    var h1 = document.querySelector('h1');
    if (h1 && !h1.closest('.prose') && !h1.closest('#article-body')) {
      var titleText = nodeText(h1);
      if (titleText) sections.push(titleText);
    }

    // 2. Subtitle — p immediately after h1 that is not a category label
    if (h1) {
      var sib = h1.nextElementSibling;
      while (sib) {
        var tag = sib.tagName;
        if (tag === 'DIV') break;
        if (tag === 'P' && !sib.hasAttribute('data-i18n')) {
          var subText = nodeText(sib);
          if (subText.length > 10) { sections.push(subText); break; }
        }
        sib = sib.nextElementSibling;
      }
    }

    // 3. Body — structural elements inside .prose / #article-body
    var root = document.getElementById('article-body') || document.querySelector('.prose');
    if (root) {
      var nodes = root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote');
      if (nodes.length) {
        var bodyParts = [];
        for (var i = 0; i < nodes.length; i++) {
          var t = nodeText(nodes[i]);
          if (t.length > 3) bodyParts.push(t);
        }
        if (bodyParts.length) sections.push(bodyParts.join(' '));
      } else {
        var raw = nodeText(root);
        if (raw) sections.push(raw);
      }
    }

    return sections.join('. ');
  }

  function injectStyles() {
    if (document.getElementById('tts-styles')) return;
    var s = document.createElement('style');
    s.id = 'tts-styles';
    s.textContent = [
      '@keyframes sma-eq1{0%,100%{height:4px;margin-top:8px}50%{height:12px;margin-top:0px}}',
      '@keyframes sma-eq2{0%,100%{height:8px;margin-top:4px}33%{height:4px;margin-top:8px}66%{height:12px;margin-top:0px}}',
      '@keyframes sma-eq3{0%,100%{height:6px;margin-top:6px}50%{height:4px;margin-top:8px}}',
      '@keyframes sma-eq4{0%,100%{height:10px;margin-top:2px}40%{height:4px;margin-top:8px}70%{height:12px;margin-top:0px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function htmlEqualizer() {
    var bar = 'display:inline-block;width:3px;background:currentColor;border-radius:2px;';
    return [
      '<span style="display:inline-flex;align-items:flex-end;gap:2px;height:12px;flex-shrink:0;overflow:hidden">',
      '<span style="' + bar + 'animation:sma-eq1 0.75s ease-in-out infinite"></span>',
      '<span style="' + bar + 'animation:sma-eq2 0.75s ease-in-out infinite 0.1s"></span>',
      '<span style="' + bar + 'animation:sma-eq4 0.75s ease-in-out infinite 0.2s"></span>',
      '<span style="' + bar + 'animation:sma-eq3 0.75s ease-in-out infinite 0.3s"></span>',
      '</span>'
    ].join('');
  }

  function svgSpeaker() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  }

  function svgPlay() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;display:block"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }

  function svgStop() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;display:block"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
  }

  function stopKeepalive() {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  }

  function startKeepalive() {
    stopKeepalive();
    keepAliveTimer = setInterval(function () {
      if (state === 'playing' && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (state === 'idle') { stopKeepalive(); }
    }, 10000);
  }

  function setState(s) {
    state = s;
    if (s === 'playing') { startKeepalive(); } else { stopKeepalive(); }
    renderButton();
  }

  function renderButton() {
    var btn = document.getElementById('tts-listen-btn');
    var stopBtn = document.getElementById('tts-stop-btn');
    if (!btn) return;

    var lbl = getLabels();
    var isActive = state !== 'idle';
    btn.style.borderColor = isActive ? '#f59e0b' : '#3f3f46';
    btn.style.color = isActive ? '#f59e0b' : '#a1a1aa';
    btn.setAttribute('aria-label', lbl.aria);
    btn.setAttribute('title', lbl.aria);

    if (state === 'playing') {
      btn.innerHTML = htmlEqualizer() + '<span style="white-space:nowrap">' + lbl.pause + '</span>';
    } else if (state === 'paused') {
      btn.innerHTML = svgPlay() + '<span style="white-space:nowrap">' + lbl.resume + '</span>';
    } else {
      btn.innerHTML = svgSpeaker() + '<span style="white-space:nowrap">' + lbl.listen + '</span>';
    }

    if (stopBtn) {
      stopBtn.setAttribute('aria-label', lbl.stop);
      stopBtn.setAttribute('title', lbl.stop);
      stopBtn.style.display = isActive ? 'inline-flex' : 'none';
    }
  }

  function isPlaceholderText(text) {
    if (!text || text.length < 100) return true;
    var lower = text.toLowerCase();
    return lower.indexOf('loading content') !== -1 || lower === 'loading…' || lower === 'loading...';
  }

  function handlePlay() {
    if (state === 'idle') {
      var text = getProseText();
      if (isPlaceholderText(text)) return;
      var utt = new SpeechSynthesisUtterance(text);
      utt.lang = getVoiceLang();
      utt.rate = 0.92;
      utt.pitch = 1;
      utt.onend = function () { setState('idle'); };
      utt.onerror = function (e) {
        if (e.error !== 'interrupted' && e.error !== 'canceled') { setState('idle'); }
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
      window._smaTTSUtterance = utt;
      setState('playing');
    } else if (state === 'playing') {
      window.speechSynthesis.pause();
      setState('paused');
    } else if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('playing');
    }
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setState('idle');
  }

  function injectButton() {
    if (document.getElementById('tts-listen-btn')) return;
    injectStyles();

    var container = null;

    // Strategy 1 — Layout A: metadata line has data-i18n="blog_min_read"
    var minReadEl = document.querySelector('[data-i18n="blog_min_read"]');
    if (minReadEl) {
      container = minReadEl.closest('.flex');
    }

    // Strategy 2 — Layout A fallback: flex with both "ServeMaster" and "min"
    if (!container) {
      var flexDivs = document.querySelectorAll('.flex.items-center');
      for (var i = 0; i < flexDivs.length; i++) {
        var t = flexDivs[i].textContent || '';
        if (t.indexOf('ServeMaster') !== -1 && t.indexOf('min') !== -1) {
          container = flexDivs[i];
          break;
        }
      }
    }

    // Strategy 3 — Layout B: category pill + "X min read" above the h1
    // Matches any flex div containing "N min" (e.g. "6 min read") without "ServeMaster"
    if (!container) {
      var allFlex = document.querySelectorAll('.flex.items-center');
      for (var j = 0; j < allFlex.length; j++) {
        var txt = allFlex[j].textContent || '';
        if (/\d+\s*min/.test(txt)) {
          container = allFlex[j];
          break;
        }
      }
    }

    if (!container) return;

    var lbl = getLabels();

    var sep = document.createElement('span');
    sep.textContent = '·';
    sep.style.color = '#52525b';
    container.appendChild(sep);

    var btn = document.createElement('button');
    btn.id = 'tts-listen-btn';
    btn.setAttribute('aria-label', lbl.aria);
    btn.setAttribute('title', lbl.aria);
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'padding:3px 10px 3px 8px',
      'border-radius:9999px',
      'border:1px solid #3f3f46',
      'background:transparent',
      'color:#a1a1aa',
      'font-size:0.7rem',
      'font-weight:600',
      'cursor:pointer',
      'transition:border-color 0.15s,color 0.15s',
      'letter-spacing:0.05em',
      'text-transform:uppercase',
      'line-height:1.4',
      'font-family:inherit',
      'vertical-align:middle'
    ].join(';');
    btn.innerHTML = svgSpeaker() + '<span style="white-space:nowrap">' + lbl.listen + '</span>';
    btn.addEventListener('click', handlePlay);
    container.appendChild(btn);

    var stopBtn = document.createElement('button');
    stopBtn.id = 'tts-stop-btn';
    stopBtn.setAttribute('aria-label', lbl.stop);
    stopBtn.setAttribute('title', lbl.stop);
    stopBtn.style.cssText = [
      'display:none',
      'align-items:center',
      'justify-content:center',
      'width:22px',
      'height:22px',
      'border-radius:9999px',
      'border:1px solid #3f3f46',
      'background:transparent',
      'color:#71717a',
      'cursor:pointer',
      'transition:border-color 0.15s,color 0.15s',
      'padding:0',
      'flex-shrink:0'
    ].join(';');
    stopBtn.innerHTML = svgStop();
    stopBtn.addEventListener('click', handleStop);
    stopBtn.addEventListener('mouseenter', function () {
      stopBtn.style.borderColor = '#ef4444';
      stopBtn.style.color = '#ef4444';
    });
    stopBtn.addEventListener('mouseleave', function () {
      stopBtn.style.borderColor = '#3f3f46';
      stopBtn.style.color = '#71717a';
    });
    container.appendChild(stopBtn);

    // Hook into window.setLang so button label updates on language switch
    var _origSetLang = window.setLang;
    window.setLang = function (lang) {
      if (state !== 'idle') {
        window.speechSynthesis.cancel();
        state = 'idle';
        stopKeepalive();
      }
      if (typeof _origSetLang === 'function') _origSetLang(lang);
      renderButton();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(injectButton);
    });
  } else {
    requestAnimationFrame(injectButton);
  }

  window.addEventListener('beforeunload', function () {
    window.speechSynthesis.cancel();
    stopKeepalive();
  });

  window.addEventListener('pagehide', function () {
    window.speechSynthesis.cancel();
    stopKeepalive();
  });
})();
