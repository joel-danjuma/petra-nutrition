import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthService } from '../services/auth';
import { UserService } from '../services/user';
import { EmailService } from '../services/email';
import { generateToken, generateRefreshToken, verifyRefreshToken, blacklistToken } from '../middleware/auth';
import { CustomError, ConflictError, NotFoundError, AuthenticationError } from '../middleware/error';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AuthController {
  private authService: AuthService;
  private userService: UserService;
  private emailService: EmailService;

  constructor() {
    this.authService = new AuthService();
    this.userService = new UserService();
    this.emailService = new EmailService();
  }

  async register(req: Request, res: Response) {
    const { email, password, firstName, lastName, profile } = req.body;

    try {
      // Check if user already exists
      const existingUser = await this.userService.findByEmail(email);
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

      // Generate email verification token
      const emailVerificationToken = config.ENABLE_EMAIL_VERIFICATION 
        ? crypto.randomBytes(32).toString('hex')
        : null;

      // Create user
      const userData = {
        email,
        passwordHash,
        firstName,
        lastName,
        isEmailVerified: !config.ENABLE_EMAIL_VERIFICATION,
        emailVerificationToken,
        subscriptionTier: 'FREE' as const,
        profile: profile ? {
          create: {
            ...profile,
            dietaryRestrictions: profile.dietaryRestrictions || [],
            allergies: profile.allergies || [],
            healthGoals: profile.healthGoals || [],
            cuisinePreferences: profile.cuisinePreferences || [],
          }
        } : undefined,
      };

      const user = await this.userService.create(userData);

      // Send verification email if enabled
      if (config.ENABLE_EMAIL_VERIFICATION && emailVerificationToken) {
        await this.emailService.sendVerificationEmail(
          user.email,
          user.firstName,
          emailVerificationToken
        );
      }

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      };

      const token = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Log successful registration
      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isEmailVerified: user.isEmailVerified,
            subscriptionTier: user.subscriptionTier,
            profile: user.profile,
          },
          token,
          refreshToken,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requiresEmailVerification: config.ENABLE_EMAIL_VERIFICATION && !user.isEmailVerified,
        },
      });
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    try {
      // Find user
      const user = await this.userService.findByEmail(email);
      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Check if email is verified (if required)
      if (config.ENABLE_EMAIL_VERIFICATION && !user.isEmailVerified) {
        throw new AuthenticationError('Please verify your email address before logging in');
      }

      // Update last login
      await this.userService.updateLastLogin(user.id);

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      };

      const token = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Log successful login
      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isEmailVerified: user.isEmailVerified,
            subscriptionTier: user.subscriptionTier,
            profile: user.profile,
          },
          token,
          refreshToken,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AuthenticationError('Refresh token is required');
    }

    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Check if user still exists
      const user = await this.userService.findById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Generate new tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      };

      const newToken = generateToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isEmailVerified: user.isEmailVerified,
            subscriptionTier: user.subscriptionTier,
            profile: user.profile,
          },
          token: newToken,
          refreshToken: newRefreshToken,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async logout(req: Request, res: Response) {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await blacklistToken(token);
      }

      logger.info('User logged out successfully', {
        userId: req.user?.id,
        email: req.user?.email,
      });

      res.json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }

  async requestPasswordReset(req: Request, res: Response) {
    const { email } = req.body;

    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return res.json({
          success: true,
          data: {
            message: 'If an account with that email exists, we have sent a password reset link.',
          },
          metadata: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      // Save reset token
      await this.userService.setPasswordResetToken(user.id, resetToken, resetExpires);

      // Send reset email
      await this.emailService.sendPasswordResetEmail(
        user.email,
        user.firstName,
        resetToken
      );

      logger.info('Password reset requested', {
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          message: 'Password reset email sent',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Password reset request failed:', error);
      throw error;
    }
  }

  async confirmPasswordReset(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    try {
      const user = await this.userService.findByPasswordResetToken(token);
      if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
        throw new AuthenticationError('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);

      // Update password and clear reset token
      await this.userService.resetPassword(user.id, passwordHash);

      logger.info('Password reset completed', {
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          message: 'Password reset successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Password reset confirmation failed:', error);
      throw error;
    }
  }

  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params;

    try {
      const user = await this.userService.findByEmailVerificationToken(token);
      if (!user) {
        throw new NotFoundError('Invalid verification token');
      }

      // Mark email as verified
      await this.userService.verifyEmail(user.id);

      logger.info('Email verified successfully', {
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          message: 'Email verified successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Email verification failed:', error);
      throw error;
    }
  }

  async resendVerification(req: Request, res: Response) {
    const { email } = req.body;

    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return res.json({
          success: true,
          data: {
            message: 'If an account with that email exists, we have sent a verification email.',
          },
          metadata: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (user.isEmailVerified) {
        throw new CustomError('Email is already verified', 400, 'EMAIL_ALREADY_VERIFIED');
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await this.userService.setEmailVerificationToken(user.id, verificationToken);

      // Send verification email
      await this.emailService.sendVerificationEmail(
        user.email,
        user.firstName,
        verificationToken
      );

      logger.info('Verification email resent', {
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        data: {
          message: 'Verification email sent',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Resend verification failed:', error);
      throw error;
    }
  }
}
