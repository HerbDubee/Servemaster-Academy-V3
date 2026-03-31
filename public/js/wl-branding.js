/**
 * wl-branding.js — White-label tenant branding injection
 *
 * Usage (authenticated pages):   applyWlBranding()
 * Usage (public invite pages):   applyWlBrandingForInvite(code)
 *
 * Both helpers are no-ops if the restaurant has no active white-label config,
 * so it is always safe to call them unconditionally.
 */

(function () {
  'use strict';

  /** Inject CSS custom properties + swap nav logo if branding is active */
  function applyBrandingObject(b) {
    if (!b || !b.isActive) return;

    const root = document.documentElement;
    if (b.primaryColor) root.style.setProperty('--wl-primary', b.primaryColor);
    if (b.accentColor)  root.style.setProperty('--wl-accent',  b.accentColor);

    // Swap the nav logo
    if (b.logoUrl) {
      document.querySelectorAll('img[alt*="ServeMaster"], img[data-wl-logo]').forEach(img => {
        img.src = b.logoUrl;
        img.alt = b.brandName;
        img.dataset.wlLogo = '1';
      });
    }

    // Update page <title> & any visible h1/h2 that contains "ServeMaster Academy"
    if (b.brandName) {
      document.title = document.title.replace(/ServeMaster Academy/g, b.brandName);
      document.querySelectorAll('[data-wl-brand]').forEach(el => {
        el.textContent = b.brandName;
      });
    }

    // Expose globally so other scripts can read it
    window.wlBranding = b;

    // Dispatch a custom event so other scripts can react
    window.dispatchEvent(new CustomEvent('wl:branding', { detail: b }));
  }

  /** Fetch branding for the logged-in user (requires sma-token) */
  async function applyWlBranding() {
    const token = localStorage.getItem('sma-token');
    if (!token) return;
    try {
      const res = await fetch('/api/tenant/branding', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) return;
      const { branding } = await res.json();
      applyBrandingObject(branding);
    } catch (_) {}
  }

  /** Fetch branding for a public invite code */
  async function applyWlBrandingForInvite(code) {
    if (!code) return;
    try {
      const res = await fetch('/api/tenant/branding/invite?code=' + encodeURIComponent(code));
      if (!res.ok) return;
      const { branding } = await res.json();
      applyBrandingObject(branding);
    } catch (_) {}
  }

  window.applyWlBranding = applyWlBranding;
  window.applyWlBrandingForInvite = applyWlBrandingForInvite;
})();
