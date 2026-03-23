(function () {
  if (!window.speechSynthesis) return;

  var LANG_MAP = { en: 'en-US', fr: 'fr-FR', es: 'es-ES' };
  var state = 'idle';
  var keepAliveTimer = null;

  function getLang() {
    var l = localStorage.getItem('sma-lang') || 'en';
    return LANG_MAP[l] || 'en-US';
  }

  function getProseText() {
    var el = document.getElementById('article-body') || document.querySelector('.prose');
    if (!el) return '';
    var raw = el.innerText || el.textContent || '';
    return raw.replace(/\s+/g, ' ').trim();
  }

  function svgSpeaker() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  }

  function svgPause() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;display:block"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
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

    var isActive = state !== 'idle';
    btn.style.borderColor = isActive ? '#f59e0b' : '#3f3f46';
    btn.style.color = isActive ? '#f59e0b' : '#a1a1aa';

    if (state === 'playing') {
      btn.innerHTML = svgPause() + '<span style="white-space:nowrap">Pause</span>';
    } else if (state === 'paused') {
      btn.innerHTML = svgPlay() + '<span style="white-space:nowrap">Resume</span>';
    } else {
      btn.innerHTML = svgSpeaker() + '<span style="white-space:nowrap">Listen</span>';
    }

    if (stopBtn) {
      stopBtn.style.display = isActive ? 'inline-flex' : 'none';
    }
  }

  function handlePlay() {
    if (state === 'idle') {
      var text = getProseText();
      if (!text || text.length < 10) return;
      var utt = new SpeechSynthesisUtterance(text);
      utt.lang = getLang();
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

    var container = null;

    var minReadEl = document.querySelector('[data-i18n="blog_min_read"]');
    if (minReadEl) {
      container = minReadEl.closest('.flex');
    }

    if (!container) {
      var flexDivs = document.querySelectorAll('.flex.items-center');
      for (var i = 0; i < flexDivs.length; i++) {
        var t = flexDivs[i].textContent || '';
        if (t.indexOf('min') !== -1 && t.indexOf('ServeMaster') !== -1) {
          container = flexDivs[i];
          break;
        }
      }
    }

    if (!container) return;

    var sep = document.createElement('span');
    sep.textContent = '·';
    sep.style.color = '#52525b';
    container.appendChild(sep);

    var btn = document.createElement('button');
    btn.id = 'tts-listen-btn';
    btn.setAttribute('aria-label', 'Listen to this article');
    btn.setAttribute('title', 'Listen to this article');
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
    btn.innerHTML = svgSpeaker() + '<span style="white-space:nowrap">Listen</span>';
    btn.addEventListener('click', handlePlay);
    container.appendChild(btn);

    var stopBtn = document.createElement('button');
    stopBtn.id = 'tts-stop-btn';
    stopBtn.setAttribute('aria-label', 'Stop listening');
    stopBtn.setAttribute('title', 'Stop');
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
