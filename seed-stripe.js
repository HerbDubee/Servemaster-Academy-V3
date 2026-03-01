const { getUncachableStripeClient } = require('./stripeClient');

async function seed() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'ServeMaster Pro'" });
  if (existing.data.length > 0) {
    console.log('Products already exist, listing prices:');
    for (const p of existing.data) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        console.log(`  ${pr.id} - ${pr.unit_amount/100} ${pr.currency.toUpperCase()} / ${pr.recurring?.interval || 'one-time'}`);
      }
    }
    return;
  }

  const product = await stripe.products.create({
    name: 'ServeMaster Pro',
    description: 'Full access to all 12 training modules, 30 AI scenarios, voice roleplay, completion certificate, and leaderboard.',
  });
  console.log('Created product:', product.id);

  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900,
    currency: 'usd',
    recurring: { interval: 'month' },
    nickname: 'Pro Monthly',
  });
  console.log('Monthly price:', monthly.id);

  const annual = await stripe.prices.create({
    product: product.id,
    unit_amount: 14900,
    currency: 'usd',
    recurring: { interval: 'year' },
    nickname: 'Pro Annual',
  });
  console.log('Annual price:', annual.id);
  console.log('\nSave these price IDs in your .env or config!');
  console.log(`STRIPE_MONTHLY_PRICE_ID=${monthly.id}`);
  console.log(`STRIPE_ANNUAL_PRICE_ID=${annual.id}`);
}

seed().catch(console.error);
