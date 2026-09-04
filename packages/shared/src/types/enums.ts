import { z } from 'zod';

/**
 * The canonical enum vocabulary, mirroring the Prisma enums exactly.
 *
 * The contract is **lenient in, truthful out**: every schema here accepts
 * either casing on the way in and always yields the UPPERCASE value the
 * database and every API response actually use.
 *
 * This exists because the two halves of the codebase disagreed. Prisma has
 * always been uppercase; the schemas here used to declare lowercase; and only
 * one endpoint (`/analytics/waste-log`) translated between them. The result was
 * a coin flip — `subscriptionTier === 'premium'` silently never matched, and
 * `POST /pantry` rejected every request the app sent.
 */

/**
 * A Zod enum that accepts any casing and normalises to the canonical value.
 * Non-strings pass straight through so Zod reports the real type error rather
 * than a confusing "invalid enum value".
 */
export const dbEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    value => (typeof value === 'string' ? value.toUpperCase() : value),
    z.enum(values)
  );

export const SUBSCRIPTION_TIERS = ['FREE', 'PREMIUM'] as const;
export const ACTIVITY_LEVELS = [
  'SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTREMELY_ACTIVE',
] as const;
export const HEALTH_GOALS = [
  'WEIGHT_LOSS', 'WEIGHT_GAIN', 'MUSCLE_GAIN', 'MAINTENANCE', 'HEART_HEALTH',
  'DIABETES_MANAGEMENT',
] as const;
export const COOKING_SKILLS = ['BEGINNER', 'CONFIDENT', 'EXPERIENCED'] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const ITEM_CATEGORIES = [
  'PRODUCE', 'DAIRY', 'MEAT', 'SEAFOOD', 'GRAINS', 'PANTRY_STAPLES', 'SPICES',
  'CONDIMENTS', 'BEVERAGES', 'FROZEN', 'CANNED', 'SNACKS', 'OTHER',
] as const;
export const STORAGE_LOCATIONS = ['PANTRY', 'FRIDGE', 'FREEZER'] as const;
export const WASTE_ACTIONS = ['USED', 'WASTED'] as const;
export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;

export const SubscriptionTierSchema = dbEnum(SUBSCRIPTION_TIERS);
export const ActivityLevelSchema = dbEnum(ACTIVITY_LEVELS);
export const HealthGoalSchema = dbEnum(HEALTH_GOALS);
export const CookingSkillSchema = dbEnum(COOKING_SKILLS);
export const DifficultySchema = dbEnum(DIFFICULTIES);
export const ItemCategorySchema = dbEnum(ITEM_CATEGORIES);
export const StorageLocationSchema = dbEnum(STORAGE_LOCATIONS);
export const WasteActionSchema = dbEnum(WASTE_ACTIONS);
export const MealTypeSchema = dbEnum(MEAL_TYPES);
export const PrioritySchema = dbEnum(PRIORITIES);
export const MessageRoleSchema = dbEnum(MESSAGE_ROLES);
export const PaymentStatusSchema = dbEnum(PAYMENT_STATUSES);

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type HealthGoal = (typeof HEALTH_GOALS)[number];
export type CookingSkill = (typeof COOKING_SKILLS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];
export type WasteAction = (typeof WASTE_ACTIONS)[number];
export type MealType = (typeof MEAL_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type MessageRole = (typeof MESSAGE_ROLES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Normalise any enum-ish string to the canonical form. */
export const toCanonical = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase();

/**
 * Case-insensitive enum comparison. Use this rather than `===` anywhere the
 * value could have come from an API response — that assumption is what made
 * the premium gate and the pantry category filter silently always-false.
 */
export const enumEquals = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => toCanonical(a) === toCanonical(b);

/**
 * The single place that answers "is this user premium". Every gate should go
 * through here so the comparison can never drift again.
 */
export const isPremium = (
  user: { subscriptionTier?: string | null } | null | undefined
): boolean => enumEquals(user?.subscriptionTier, 'PREMIUM');

/** Human-facing label for an enum value: `PANTRY_STAPLES` -> `Pantry staples`. */
export const enumLabel = (value: string | null | undefined): string => {
  const v = toCanonical(value);
  if (!v) return '';
  const words = v.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
