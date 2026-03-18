(async function () {
  try {
    const r = await fetch('/api/crisp-config');
    if (!r.ok) return;
    const { enabled, websiteId } = await r.json();
    if (!enabled || !websiteId || websiteId === 'REPLACE_WITH_CRISP_WEBSITE_ID') return;
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = websiteId;
    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
  } catch (e) {}
})();
