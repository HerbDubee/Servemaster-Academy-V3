const Stripe = require('stripe');

async function getCredentials() {
  const explicitKey = process.env.STRIPE_SECRET_KEY;
  if (explicitKey) {
    return { secretKey: explicitKey, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (hostname && xReplitToken) {
    const environments = ['development', 'production'];

    for (const env of environments) {
      try {
        const url = new URL(`https://${hostname}/api/v2/connection`);
        url.searchParams.set('include_secrets', 'true');
        url.searchParams.set('connector_names', 'stripe');
        url.searchParams.set('environment', env);

        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken }
        });
        const data = await response.json();
        const conn = data.items?.[0];
        if (conn?.settings?.secret) {
          return { secretKey: conn.settings.secret, publishableKey: conn.settings.publishable || '' };
        }
      } catch (_) {}
    }
  }

  throw new Error('Stripe credentials not available');
}

async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });
}

async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

let stripeSync = null;
async function getStripeSync() {
  if (!process.env.REPLIT_DOMAINS) {
    throw new Error('getStripeSync() is only available in Replit environments');
  }
  if (!stripeSync) {
    const { StripeSync } = require('stripe-replit-sync');
    const { secretKey } = await getCredentials();
    stripeSync = new StripeSync({
      poolConfig: { connectionString: process.env.DATABASE_URL, max: 2 },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}

module.exports = { getUncachableStripeClient, getStripePublishableKey, getStripeSync, getCredentials };
