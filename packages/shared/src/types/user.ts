import { z } from 'zod';
import { ActivityLevelSchema, CookingSkillSchema, HealthGoalSchema, SubscriptionTierSchema } from './enums';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  isEmailVerified: z.boolean().default(false),
  subscriptionTier: SubscriptionTierSchema.default('FREE'),
  profile: z.object({
    age: z.number().optional(),
    height: z.number().optional(), // in cm
    weight: z.number().optional(), // in kg
    activityLevel: ActivityLevelSchema.optional(),
    dietaryRestrictions: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    healthGoals: z.array(HealthGoalSchema).default([]),
    cuisinePreferences: z.array(z.string()).default([]),
    householdSize: z.number().int().min(1).optional(),
    cookingSkill: CookingSkillSchema.optional(),
    onboardingCompletedAt: z.date().optional(),
    dailyCalorieTarget: z.number().optional(),
    dailyProteinTarget: z.number().optional(), // in grams
    dailyFiberTarget: z.number().optional(), // in grams
    dailySodiumTarget: z.number().optional(), // in mg
    dailyVegServings: z.number().optional(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isEmailVerified: true,
}).extend({
  password: z.string().min(8),
});

export const UpdateUserSchema = UserSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const PasswordResetSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export const CompleteOnboardingSchema = z.object({
  dietaryRestrictions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  householdSize: z.number().int().min(1).optional(),
  cookingSkill: CookingSkillSchema.optional(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type PasswordReset = z.infer<typeof PasswordResetSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type CompleteOnboarding = z.infer<typeof CompleteOnboardingSchema>;

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}
