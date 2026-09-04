import { prisma } from '../database';
import { logger } from '../utils/logger';

export class UserService {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async create(userData: any) {
    return prisma.user.create({
      data: userData,
      include: { profile: true },
    });
  }

  async update(id: string, userData: any) {
    return prisma.user.update({
      where: { id },
      data: userData,
      include: { profile: true },
    });
  }

  async updateLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async setPasswordResetToken(id: string, token: string, expires: Date) {
    return prisma.user.update({
      where: { id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });
  }

  async findByPasswordResetToken(token: string) {
    return prisma.user.findFirst({
      where: { passwordResetToken: token },
    });
  }

  async resetPassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  }

  async setEmailVerificationToken(id: string, token: string) {
    return prisma.user.update({
      where: { id },
      data: { emailVerificationToken: token },
    });
  }

  async findByEmailVerificationToken(token: string) {
    return prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });
  }

  async verifyEmail(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
      },
    });
  }

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  }

  async completeOnboarding(id: string, data: {
    dietaryRestrictions?: string[];
    allergies?: string[];
    householdSize?: number;
    cookingSkill?: string;
  }) {
    const profile: any = {
      dietaryRestrictions: data.dietaryRestrictions ?? [],
      allergies: data.allergies ?? [],
      ...(data.householdSize !== undefined && { householdSize: data.householdSize }),
      ...(data.cookingSkill !== undefined && { cookingSkill: data.cookingSkill.toUpperCase() }),
      onboardingCompletedAt: new Date(),
    };

    return prisma.user.update({
      where: { id },
      data: {
        profile: {
          upsert: {
            create: profile,
            update: profile,
          },
        },
      },
      include: { profile: true },
    });
  }
}
