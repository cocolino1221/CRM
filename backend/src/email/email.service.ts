import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailProvider = this.configService.get<string>('EMAIL_PROVIDER', 'smtp');

    if (emailProvider === 'sendgrid') {
      // SendGrid configuration
      const sendgridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
      if (sendgridApiKey) {
        this.transporter = nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: sendgridApiKey,
          },
        });
        this.logger.log('Email service initialized with SendGrid');
      } else {
        this.logger.warn('SendGrid API key not found, email service disabled');
      }
    } else {
      // Generic SMTP configuration
      const smtpHost = this.configService.get<string>('SMTP_HOST');
      const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
      const smtpUser = this.configService.get<string>('SMTP_USER');
      const smtpPass = this.configService.get<string>('SMTP_PASS');

      if (smtpHost && smtpUser && smtpPass) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
        this.logger.log('Email service initialized with SMTP');
      } else {
        this.logger.warn('SMTP configuration not found, email service disabled');
      }
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email service not configured, email not sent');
      return false;
    }

    try {
      const fromEmail = options.from || this.configService.get<string>('FROM_EMAIL', 'noreply@slackcrm.com');

      const mailOptions = {
        from: fromEmail,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${mailOptions.to}: ${options.subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return false;
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <p style="margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 14px;">SlackCRM - AI-Powered Team CRM</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: 'Reset Your Password - SlackCRM',
      html,
      text: `Reset your password by visiting: ${resetUrl}. This link will expire in 1 hour.`,
    });
  }

  async sendEmailVerification(to: string, verificationToken: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const verifyUrl = `${frontendUrl}/auth/verify-email?token=${verificationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify Your Email Address</h2>
        <p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
        <p style="margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email
          </a>
        </p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 14px;">SlackCRM - AI-Powered Team CRM</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: 'Verify Your Email - SlackCRM',
      html,
      text: `Verify your email by visiting: ${verifyUrl}. This link will expire in 24 hours.`,
    });
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to SlackCRM, ${firstName}!</h2>
        <p>We're excited to have you on board. Here's what you can do to get started:</p>
        <ul style="line-height: 1.8;">
          <li>Import your contacts or add them manually</li>
          <li>Set up your Slack integration for team collaboration</li>
          <li>Create your first deal pipeline</li>
          <li>Explore AI-powered features for lead scoring</li>
        </ul>
        <p style="margin: 30px 0;">
          <a href="${frontendUrl}/dashboard" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Go to Dashboard
          </a>
        </p>
        <p>Need help? Check out our <a href="${frontendUrl}/docs">documentation</a> or contact support.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 14px;">SlackCRM - AI-Powered Team CRM</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `Welcome to SlackCRM, ${firstName}!`,
      html,
      text: `Welcome to SlackCRM! Get started at ${frontendUrl}/dashboard`,
    });
  }

  async sendInviteEmail(to: string, inviterName: string, workspaceName: string, inviteToken: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const inviteUrl = `${frontendUrl}/auth/accept-invite?token=${inviteToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've Been Invited to Join ${workspaceName}</h2>
        <p>${inviterName} has invited you to join their team on SlackCRM.</p>
        <p style="margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Accept Invite
          </a>
        </p>
        <p>This invitation will expire in 7 days.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 14px;">SlackCRM - AI-Powered Team CRM</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `You've been invited to join ${workspaceName} on SlackCRM`,
      html,
      text: `${inviterName} has invited you to join ${workspaceName}. Accept your invite at: ${inviteUrl}`,
    });
  }
}
