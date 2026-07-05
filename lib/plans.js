'use strict';

// Ordered plan tiers (low → high) used for comparing effective access levels.
const PLAN_TIER_ORDER = ['free', 'premium_monthly', 'premium', 'starter_team', 'pro_team', 'enterprise'];

// Subscription statuses that count as a paid/active plan.
const PAID_PLAN_STATUSES = new Set([
  'premium_monthly', 'premium', 'individual', 'starter_team', 'pro_team', 'enterprise', 'active',
]);

module.exports = { PLAN_TIER_ORDER, PAID_PLAN_STATUSES };
