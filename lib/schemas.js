'use strict';
/**
 * Centralized Zod validation schemas for auth, payment, and contact routes.
 *
 * Conventions:
 *  - Emails are trimmed + lowercased so storage/lookup is case-insensitive.
 *  - Free-text fields have sane max lengths to blunt abuse and oversized payloads.
 *  - Objects strip unknown keys by default (Zod), so handlers only see vetted data.
 */

const { z } = require('zod');

// Trim + lowercase, then validate shape. Kept regex-simple on purpose —
// real deliverability is confirmed by the email actually being received.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'A valid email is required' });

const optionalText = (max) => z.string().trim().max(max).optional();
const requiredText = (max, label) => z.string().trim().min(1, `${label} is required`).max(max);

// ── Auth ──────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: requiredText(200, 'Name'),
  level: optionalText(100),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  token: requiredText(200, 'Token'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

// ── Payments ─────────────────────────────────────────────────────────────
const checkoutSchema = z.object({
  plan: z.enum(
    ['premium_monthly', 'premium_annual', 'starter_team', 'pro_team', 'starter_team_annual', 'pro_team_annual'],
    { error: 'Invalid plan' }
  ),
});

// ── Contact / lead capture ─────────────────────────────────────────────────
const newsletterSchema = z.object({
  email,
  firstName: optionalText(120),
  source: optionalText(64),
  role: optionalText(120),
});

const contactSchema = z.object({
  name: requiredText(200, 'Name'),
  email,
  message: requiredText(5000, 'Message'),
});

const teamTrialSchema = z.object({
  name: requiredText(200, 'Name'),
  email,
  restaurantName: requiredText(200, 'Restaurant name'),
  staffCount: z.union([z.string().max(50), z.number()]).optional(),
});

const enterpriseSchema = z.object({
  name: requiredText(200, 'Name'),
  email,
  company: requiredText(200, 'Company'),
  locations: optionalText(200),
  message: optionalText(5000),
});

const referralInviteSchema = z.object({
  managerEmail: email,
  note: optionalText(2000),
});

const inviteRedeemSchema = z.object({
  code: requiredText(100, 'Code'),
});

// ── Shared building blocks (manager / admin) ───────────────────────────────
// Hex colours and logo URLs may be sent as an empty string to clear them, so
// accept '' alongside the validated form (matching the legacy inline guards).
const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'use #rrggbb format');
const optionalHex = z.union([z.literal(''), hexColor]).optional();
const httpUrl = z.string().trim().regex(/^https?:\/\/.+/, 'must start with http:// or https://');
const optionalHttpUrl = z.union([z.literal(''), httpUrl]).optional();
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');
const optionalIsoDate = z.union([z.literal(''), isoDate]).nullable().optional();
const moduleId = z.coerce
  .number({ error: 'moduleId must be a number between 1 and 30' })
  .int('moduleId must be a number between 1 and 30')
  .min(1, 'moduleId must be a number between 1 and 30')
  .max(30, 'moduleId must be a number between 1 and 30');
const userId = z.coerce.number({ error: 'userId is required' }).int('userId is required').positive('userId is required');

const PLAN_VALUES = ['free', 'premium', 'starter_team', 'pro_team', 'enterprise'];
const ROLE_VALUES = ['user', 'manager', 'admin'];

// ── Manager routes ─────────────────────────────────────────────────────────
const createRestaurantSchema = z.object({
  restaurantName: requiredText(200, 'Restaurant name'),
});

const joinRestaurantSchema = z.object({
  inviteCode: requiredText(100, 'Invite code'),
});

const whiteLabelSchema = z.object({
  brandName: optionalText(200),
  logoUrl: optionalHttpUrl,
  primaryColor: optionalHex,
  accentColor: optionalHex,
  isActive: z.boolean().optional(),
});

const userIdBodySchema = z.object({ userId });

const digestPreferenceSchema = z.object({
  enabled: z.boolean({ error: 'enabled must be boolean' }),
});

const deadlineSchema = z.object({ deadline: optionalIsoDate });

const assignModuleSchema = z.object({ moduleId });

const createTrainingPlanSchema = z.object({
  userId,
  title: optionalText(200),
});

const trainingPlanItemSchema = z.object({
  moduleId,
  dueDate: optionalIsoDate,
  position: z.coerce.number().int().optional(),
});

const certLogoSchema = z.object({ certLogoUrl: optionalHttpUrl.nullable() });

// ── Admin routes ───────────────────────────────────────────────────────────
const createTenantSchema = z.object({
  brandName: requiredText(200, 'Brand name'),
  managerEmail: email,
  primaryColor: optionalHex,
});

const updateUserSchema = z
  .object({
    plan: z.enum(PLAN_VALUES, { error: 'Invalid plan' }).optional(),
    role: z.enum(ROLE_VALUES, { error: 'Invalid role' }).optional(),
    // Apprenticeship track assignment; '' clears the override.
    trainingTrack: z.enum(['foundations', 'craft', 'mastery', ''], { error: 'Invalid track' }).optional(),
  })
  .refine((d) => d.plan || d.role || d.trainingTrack !== undefined, { message: 'Provide plan, role, and/or trainingTrack' });

const provisionTrialSchema = z.object({ provisioned: z.boolean().optional() });

const sendTrialCodeSchema = z.object({
  plan: z.enum(['starter_team', 'pro_team']).optional(),
});

const createInviteCodeSchema = z.object({
  plan: z.enum(PLAN_VALUES, { error: 'Invalid plan' }).optional(),
  maxUses: z.coerce.number().int().min(0).optional(),
  expiresAt: optionalIsoDate,
  accessDays: z.coerce.number().int().min(0).optional(),
});

const updateInviteCodeSchema = z.object({
  plan: z.enum(PLAN_VALUES, { error: 'Invalid plan' }),
});

const sendEmailSchema = z.object({
  emailType: requiredText(64, 'emailType'),
  userEmail: email,
});

const siteSettingSchema = z.object({
  key: requiredText(120, 'key'),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// ── Admin affiliates routes ────────────────────────────────────────────────
const markCommissionPaidSchema = z.object({
  payment_ref: requiredText(200, 'Payment reference'),
  payout_method: optionalText(64),
  payout_amount: z.coerce.number().optional(),
  override_pending: z.boolean().optional(),
});

const commissionReasonSchema = z.object({ reason: optionalText(500) });

const updatePayoutMethodSchema = z.object({
  pref_payout_method: optionalText(64).nullable(),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  checkoutSchema,
  newsletterSchema,
  contactSchema,
  teamTrialSchema,
  enterpriseSchema,
  referralInviteSchema,
  inviteRedeemSchema,
  // manager
  createRestaurantSchema,
  joinRestaurantSchema,
  whiteLabelSchema,
  userIdBodySchema,
  digestPreferenceSchema,
  deadlineSchema,
  assignModuleSchema,
  createTrainingPlanSchema,
  trainingPlanItemSchema,
  certLogoSchema,
  // admin
  createTenantSchema,
  updateUserSchema,
  provisionTrialSchema,
  sendTrialCodeSchema,
  createInviteCodeSchema,
  updateInviteCodeSchema,
  sendEmailSchema,
  siteSettingSchema,
  // admin affiliates
  markCommissionPaidSchema,
  commissionReasonSchema,
  updatePayoutMethodSchema,
};
