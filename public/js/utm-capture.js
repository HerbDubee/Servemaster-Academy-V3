(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var STORAGE_KEY = 'sma_attribution_v1';
  var COOKIE_TTL_DAYS = 30;

  function readStored() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeStored(data) {
    try {
      var s = JSON.stringify(data);
      sessionStorage.setItem(STORAGE_KEY, s);
      localStorage.setItem(STORAGE_KEY, s);
    } catch (e) {}
  }

  function setCookie(name, value) {
    try {
      var d = new Date();
      d.setTime(d.getTime() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000);
      document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  function captureFromUrl() {
    var params;
    try { params = new URLSearchParams(window.location.search); }
    catch (e) { return null; }
    var found = false;
    var data = {};
    KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) { data[k] = v.slice(0, 120); found = true; }
    });
    if (!found) return null;
    var ref = '';
    try { ref = (document.referrer || '').slice(0, 500); } catch (e) {}
    if (ref) data.attribution_referrer = ref;
    return data;
  }

  function init() {
    var fromUrl = captureFromUrl();
    var existing = readStored();
    var data = existing || {};
    if (fromUrl) {
      // First-touch attribution: only overwrite if we don't already have one,
      // OR if the new visit carries explicit utm_source (treat as fresh touch).
      if (!existing || fromUrl.utm_source) {
        data = fromUrl;
        writeStored(data);
      }
    } else if (!existing) {
      // Fall back to organic referrer if no UTM is present and nothing is stored.
      try {
        var ref = document.referrer || '';
        if (ref && ref.indexOf(window.location.host) === -1) {
          data = { attribution_referrer: ref.slice(0, 500) };
          writeStored(data);
        }
      } catch (e) {}
    }
    // Mirror to cookies so server-side OAuth flow can see them.
    KEYS.forEach(function (k) { if (data[k]) setCookie('sma_' + k, data[k]); });
    if (data.attribution_referrer) setCookie('sma_attribution_referrer', data.attribution_referrer);

    window.SMAUtm = {
      get: function () {
        var d = readStored() || {};
        return {
          utm_source: d.utm_source || null,
          utm_medium: d.utm_medium || null,
          utm_campaign: d.utm_campaign || null,
          utm_content: d.utm_content || null,
          attribution_referrer: d.attribution_referrer || null
        };
      },
      // Convenience: merge attribution into a payload object before fetch().
      attach: function (payload) {
        var d = this.get();
        payload = payload || {};
        Object.keys(d).forEach(function (k) { if (d[k] && !payload[k]) payload[k] = d[k]; });
        return payload;
      },
      // Convenience: append UTM params to a URL (for outbound CTA links).
      decorate: function (url) {
        try {
          var d = this.get();
          var u = new URL(url, window.location.origin);
          KEYS.forEach(function (k) { if (d[k] && !u.searchParams.get(k)) u.searchParams.set(k, d[k]); });
          return u.toString();
        } catch (e) { return url; }
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
