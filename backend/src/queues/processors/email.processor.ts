import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';

interface EmailJobData {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
}

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process(JOB_TYPES.SEND_EMAIL)
  async handleSendEmail(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id}`);
    const { to, subject, html, text } = job.data;

    try {
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      this.logger.log(`Sending email to ${to} with subject: ${subject}`);

      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.logger.log(`Email sent successfully to ${to}`);
      return { success: true, to, subject };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.SEND_BULK_EMAIL)
  async handleBulkEmail(job: Job<{ emails: EmailJobData[] }>) {
    this.logger.log(`Processing bulk email job ${job.id} with ${job.data.emails.length} emails`);
    const results = [];

    for (const email of job.data.emails) {
      try {
        await this.handleSendEmail({ data: email } as Job<EmailJobData>);
        results.push({ success: true, to: email.to });
      } catch (error) {
        results.push({ success: false, to: email.to, error: error.message });
      }
    }

    return { total: job.data.emails.length, results };
  }

  @Process(JOB_TYPES.SEND_WELCOME_EMAIL)
  async handleWelcomeEmail(job: Job<{ email: string; name: string }>) {
    this.logger.log(`Sending welcome email to ${job.data.email}`);

    return this.handleSendEmail({
      data: {
        to: job.data.email,
        subject: 'Welcome to SlackCRM!',
        html: `<h1>Welcome ${job.data.name}!</h1><p>Thank you for joining SlackCRM.</p>`,
      }
    } as Job<EmailJobData>);
  }

  @Process(JOB_TYPES.SEND_PASSWORD_RESET)
  async handlePasswordReset(job: Job<{ email: string; resetToken: string }>) {
    this.logger.log(`Sending password reset email to ${job.data.email}`);

    return this.handleSendEmail({
      data: {
        to: job.data.email,
        subject: 'Reset Your Password',
        html: `<p>Reset token: ${job.data.resetToken}</p>`,
      }
    } as Job<EmailJobData>);
  }
}