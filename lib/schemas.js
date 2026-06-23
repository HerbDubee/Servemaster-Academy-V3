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
};
