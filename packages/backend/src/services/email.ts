import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }

  async sendVerificationEmail(email: string, firstName: string, token: string): Promise<void> {
    const verificationUrl = `${config.WEB_BASE_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"${config.FROM_NAME}" <${config.FROM_EMAIL}>`,
      to: email,
      subject: 'Verify Your Email Address - Petra AI',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h2>Welcome to Petra AI, ${firstName}!</h2>
          <p>Thank you for signing up. Please verify your email address to get started.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${verificationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This verification link will expire in 24 hours.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      logger.info('Verification email sent', { email, firstName });
    } catch (error) {
      logger.error('Failed to send verification email', { email, error });
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${config.WEB_BASE_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"${config.FROM_NAME}" <${config.FROM_EMAIL}>`,
      to: email,
      subject: 'Reset Your Password - Petra AI',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h2>Password Reset Request</h2>
          <p>Hi ${firstName},</p>
          <p>We received a request to reset your password for your Petra AI account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This password reset link will expire in 1 hour. If you didn't request this reset, please ignore this email.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      logger.info('Password reset email sent', { email, firstName });
    } catch (error) {
      logger.error('Failed to send password reset email', { email, error });
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const mailOptions = {
      from: `"${config.FROM_NAME}" <${config.FROM_EMAIL}>`,
      to: email,
      subject: 'Welcome to Petra AI!',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h2>Welcome to Petra AI, ${firstName}! 🍳</h2>
          <p>We're excited to help you on your culinary journey!</p>
          
          <h3>Getting Started:</h3>
          <ul>
            <li><strong>Chat with Petra:</strong> Ask for recipe suggestions, cooking tips, or meal planning advice</li>
            <li><strong>Manage Your Pantry:</strong> Keep track of ingredients and get suggestions based on what you have</li>
            <li><strong>Plan Your Meals:</strong> Create weekly meal plans tailored to your preferences</li>
            <li><strong>Smart Shopping Lists:</strong> Generate shopping lists from your meal plans</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${config.WEB_BASE_URL}/dashboard" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Get Started
            </a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Happy cooking!<br>
            The Petra AI Team
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      logger.info('Welcome email sent', { email, firstName });
    } catch (error) {
      logger.error('Failed to send welcome email', { email, error });
      // Don't throw error for welcome email failure
    }
  }
}
