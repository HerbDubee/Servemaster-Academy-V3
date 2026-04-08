(function () {
  var LANG_MAP = { en: 'en-CA', fr: 'fr-FR', es: 'es-ES' };

  var UI_LABELS = {
    en: { listen: 'Listen',   pause: 'Pause',  resume: 'Resume',   stop: 'Stop',    loading: 'Loading…', aria: 'Listen to this article' },
    fr: { listen: 'Écouter',  pause: 'Pause',  resume: 'Reprendre',stop: 'Arrêter', loading: 'Chargement…', aria: 'Écouter cet article' },
    es: { listen: 'Escuchar', pause: 'Pausar', resume: 'Reanudar', stop: 'Detener', loading: 'Cargando…', aria: 'Escuchar este artículo' }
  };

  var state = 'idle';
  var ttsChunks = [];
  var ttsChunkIndex = 0;
  var usingOpenAI = false;

  // Web Audio API state (used for OpenAI TTS playback)
  var audioCtx = null;
  var activeSource = null;

  // Browser speech state (fallback)
  var keepAliveTimer = null;

  function getSiteLang() {
    return localStorage.getItem('sma-lang') || 'en';
  }

  function getVoiceLang() {
    var siteLang = getSiteLang();
    return LANG_MAP[siteLang] || 'en-CA';
  }

  function getLabels() {
    return UI_LABELS[getSiteLang()] || UI_LABELS.en;
  }

  function nodeText(el) {
    return (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  }

  function getProseText() {
    var sections = [];

    var h1 = document.querySelector('h1');
    if (h1 && !h1.closest('.prose') && !h1.closest('#article-body')) {
      var titleText = nodeText(h1);
      if (titleText) sections.push(titleText);
    }

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
      '@keyframes sma-eq4{0%,100%{height:10px;margin-top:2px}40%{height:4px;margin-top:8px}70%{height:12px;margin-top:0px}}',
      '@keyframes spin{to{transform:rotate(360deg)}}'
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

  function svgSpinner() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;display:block;animation:spin 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
  }

  function setState(s) {
    state = s;
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

    if (state === 'loading') {
      btn.innerHTML = svgSpinner() + '<span style="white-space:nowrap">' + lbl.loading + '</span>';
    } else if (state === 'playing') {
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

  function preprocessForTTS(text, lang) {
    if (!lang || !lang.startsWith('en')) return text;

    text = text.replace(/\b(have|has|had)\s+read\b/gi, '$1 red');
    text = text.replace(/([''`]ve)\s+read\b/gi, '$1 red');
    text = text.replace(/\bget\s+read\b/gi, 'get noticed');
    text = text.replace(/\bread\b/g, 'reed');
    text = text.replace(/\btear\s+up\b/gi, 'well up with tears');
    text = text.replace(/\bclose\s+to\b/gi, 'near to');
    text = text.replace(/\bis\s+close\b(?!\s+to)/gi, 'is nearby');

    return text;
  }

  function isPlaceholderText(text) {
    if (!text || text.length < 100) return true;
    var lower = text.toLowerCase();
    return lower.indexOf('loading content') !== -1 || lower === 'loading…' || lower === 'loading...';
  }

  // ── Chunking ──────────────────────────────────────────────────────────────────

  function splitIntoChunks(text, maxLen) {
    maxLen = maxLen || 1500;
    if (text.length <= maxLen) return [text];

    var chunks = [];
    var remaining = text;

    while (remaining.length > maxLen) {
      var slice = remaining.substring(0, maxLen);
      var cut = -1;
      var candidates = [
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('\n')
      ];
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i] > cut) cut = candidates[i];
      }
      if (cut < Math.floor(maxLen / 2)) cut = slice.lastIndexOf(', ');
      if (cut < 100) cut = maxLen - 1;
      chunks.push(remaining.substring(0, cut + 1).trim());
      remaining = remaining.substring(cut + 1).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  // ── Web Audio API playback (OpenAI TTS) ──────────────────────────────────────
  // Using AudioContext instead of <audio> element so that iOS/DuckDuckGo
  // honours the user-gesture unlock from the original button click.

  function getAudioCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function stopActiveSource() {
    if (activeSource) {
      try { activeSource.stop(); } catch (e) {}
      try { activeSource.disconnect(); } catch (e) {}
      activeSource = null;
    }
  }

  function closeAudioCtx() {
    stopActiveSource();
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.close(); } catch (e) {}
    }
    audioCtx = null;
  }

  function playChunk(index) {
    if (index >= ttsChunks.length) { setState('idle'); return; }

    setState('loading');

    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsChunks[index], lang: getSiteLang() })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('TTS API ' + res.status);
      return res.arrayBuffer();
    })
    .then(function (arrayBuffer) {
      if (state === 'idle') return;
      var ctx = getAudioCtx();
      if (!ctx) throw new Error('No AudioContext');

      // Resume context in case it was suspended (required on some browsers)
      var resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      return resume.then(function () {
        return new Promise(function (resolve, reject) {
          ctx.decodeAudioData(arrayBuffer, resolve, reject);
        });
      });
    })
    .then(function (decoded) {
      if (state === 'idle') return;
      var ctx = getAudioCtx();
      if (!ctx) return;

      stopActiveSource();
      activeSource = ctx.createBufferSource();
      activeSource.buffer = decoded;
      activeSource.connect(ctx.destination);
      activeSource.onended = function () {
        if (state !== 'idle') {
          ttsChunkIndex++;
          playChunk(ttsChunkIndex);
        }
      };
      activeSource.start(0);
      setState('playing');
    })
    .catch(function (err) {
      console.warn('OpenAI TTS failed, falling back to browser voice:', err.message);
      usingOpenAI = false;
      closeAudioCtx();
      useBrowserTTS(ttsChunks.join(' '));
    });
  }

  function stopOpenAI() {
    closeAudioCtx();
    ttsChunks = [];
    ttsChunkIndex = 0;
  }

  // ── Browser (Web Speech API) fallback ────────────────────────────────────────

  function startBrowserKeepalive() {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(function () {
      if (state === 'playing' && window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (state === 'idle') { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    }, 10000);
  }

  function stopBrowserKeepalive() {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  }

  function useBrowserTTS(text) {
    if (!window.speechSynthesis) { setState('idle'); return; }
    var lang = getVoiceLang();
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.92;
    utt.pitch = 1;
    utt.onend = function () { stopBrowserKeepalive(); setState('idle'); };
    utt.onerror = function (e) {
      stopBrowserKeepalive();
      if (e.error !== 'interrupted' && e.error !== 'canceled') { setState('idle'); }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    window._smaTTSUtterance = utt;
    startBrowserKeepalive();
    setState('playing');
  }

  function stopBrowserTTS() {
    stopBrowserKeepalive();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // ── Main controls ─────────────────────────────────────────────────────────────

  function handlePlay() {
    if (state === 'loading') return;

    var siteLang = getSiteLang();

    if (state === 'idle') {
      var rawText = getProseText();
      if (isPlaceholderText(rawText)) return;
      var text = preprocessForTTS(rawText, getVoiceLang());

      usingOpenAI = true;
      ttsChunks = splitIntoChunks(text);
      ttsChunkIndex = 0;

      // Unlock the AudioContext synchronously within the user gesture.
      // iOS/DuckDuckGo require this to happen before any async work.
      var ctx = getAudioCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }

      playChunk(0);

    } else if (state === 'playing') {
      if (usingOpenAI) {
        var ctx2 = getAudioCtx();
        if (ctx2) ctx2.suspend().then(function () { setState('paused'); });
      } else if (window.speechSynthesis) {
        window.speechSynthesis.pause();
        setState('paused');
      }

    } else if (state === 'paused') {
      if (usingOpenAI) {
        var ctx3 = getAudioCtx();
        if (ctx3) ctx3.resume().then(function () { setState('playing'); });
      } else if (window.speechSynthesis) {
        window.speechSynthesis.resume();
        setState('playing');
      }
    }
  }

  function handleStop() {
    var wasOpenAI = usingOpenAI;
    usingOpenAI = false;
    if (wasOpenAI) {
      stopOpenAI();
    } else {
      stopBrowserTTS();
    }
    setState('idle');
  }

  // ── Button injection ──────────────────────────────────────────────────────────

  function injectButton() {
    if (document.getElementById('tts-listen-btn')) return;
    injectStyles();

    var container = null;

    container = document.getElementById('article-meta');

    if (!container) {
      var minReadEl = document.querySelector('[data-i18n="blog_min_read"]');
      if (minReadEl) container = minReadEl.closest('#article-meta') || minReadEl.closest('.flex') || minReadEl.parentElement;
    }

    if (!container) {
      var flexDivs = document.querySelectorAll('.flex.items-center');
      for (var i = 0; i < flexDivs.length; i++) {
        var t = flexDivs[i].textContent || '';
        if (t.indexOf('ServeMaster') !== -1 && /\d+\s*min/.test(t)) {
          container = flexDivs[i]; break;
        }
      }
    }

    if (!container) {
      var allFlex = document.querySelectorAll('.flex.items-center');
      for (var j = 0; j < allFlex.length; j++) {
        var txt = allFlex[j].textContent || '';
        if (/\d+\s*min/.test(txt)) { container = allFlex[j]; break; }
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
      'display:inline-flex', 'align-items:center', 'gap:5px',
      'padding:3px 10px 3px 8px', 'border-radius:9999px',
      'border:1px solid #3f3f46', 'background:transparent', 'color:#a1a1aa',
      'font-size:0.7rem', 'font-weight:600', 'cursor:pointer',
      'transition:border-color 0.15s,color 0.15s', 'letter-spacing:0.05em',
      'text-transform:uppercase', 'line-height:1.4', 'font-family:inherit',
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
      'display:none', 'align-items:center', 'justify-content:center',
      'width:22px', 'height:22px', 'border-radius:9999px',
      'border:1px solid #3f3f46', 'background:transparent', 'color:#71717a',
      'cursor:pointer', 'transition:border-color 0.15s,color 0.15s',
      'padding:0', 'flex-shrink:0'
    ].join(';');
    stopBtn.innerHTML = svgStop();
    stopBtn.addEventListener('click', handleStop);
    stopBtn.addEventListener('mouseenter', function () {
      stopBtn.style.borderColor = '#ef4444'; stopBtn.style.color = '#ef4444';
    });
    stopBtn.addEventListener('mouseleave', function () {
      stopBtn.style.borderColor = '#3f3f46'; stopBtn.style.color = '#71717a';
    });
    container.appendChild(stopBtn);

    var _origSetLang = window.setLang;
    window.setLang = function (lang) {
      handleStop();
      if (typeof _origSetLang === 'function') _origSetLang(lang);
      renderButton();
    };
  }

  function tryInject(attemptsLeft) {
    if (document.getElementById('tts-listen-btn')) return;
    injectButton();
    if (!document.getElementById('tts-listen-btn') && attemptsLeft > 0) {
      setTimeout(function () { tryInject(attemptsLeft - 1); }, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(function () { tryInject(8); });
    });
  } else {
    requestAnimationFrame(function () { tryInject(8); });
  }

  window.addEventListener('beforeunload', handleStop);
  window.addEventListener('pagehide', handleStop);

  // Spanish language banner — shown on English articles when UI lang = es
  (function injectLangBanner() {
    var htmlLang = document.documentElement.lang || 'en';
    if (htmlLang !== 'en') return;
    var siteLang = localStorage.getItem('sma-lang') || 'en';
    if (siteLang !== 'es') return;
    var slug = window.location.pathname.replace(/^\/blog\//, '').replace(/\/$/, '');
    if (!slug || slug.indexOf('/') !== -1) return;
    function doInject() {
      if (document.getElementById('sma-es-banner')) return;
      var main = document.querySelector('main');
      if (!main) return;
      var banner = document.createElement('div');
      banner.id = 'sma-es-banner';
      banner.style.cssText = 'background:#0a4d68;color:#fff;border-radius:12px;padding:12px 18px;margin-bottom:20px;font-size:0.875rem;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
      banner.innerHTML = '<span>🇲🇽 Este artículo también está disponible en español</span><a href="/blog/es/' + slug + '" style="background:#FF5E3A;color:#fff;font-weight:700;padding:6px 14px;border-radius:8px;text-decoration:none;white-space:nowrap;">Leer en español →</a>';
      main.insertBefore(banner, main.firstChild);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doInject);
    } else {
      doInject();
    }
  })();
})();
