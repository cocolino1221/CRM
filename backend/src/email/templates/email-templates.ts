/**
 * Email template helper functions
 * Provides pre-built HTML email templates for common use cases
 */

interface WelcomeEmailParams {
  userName: string;
  loginUrl: string;
  supportEmail?: string;
}

interface PasswordResetParams {
  userName: string;
  resetUrl: string;
  expirationHours?: number;
}

interface TaskAssignedParams {
  userName: string;
  taskTitle: string;
  taskDescription?: string;
  dueDate?: string;
  taskUrl: string;
}

interface DealWonParams {
  dealTitle: string;
  dealValue: string;
  contactName: string;
  teamMemberName: string;
}

interface WorkflowNotificationParams {
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

/**
 * Base HTML template with consistent styling
 */
const baseTemplate = (content: string, title: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #4f46e5;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #4f46e5;
    }
    .content {
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #4f46e5;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 500;
    }
    .button:hover {
      background-color: #4338ca;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
      text-align: center;
    }
    .info-box {
      background-color: #f3f4f6;
      border-left: 4px solid #4f46e5;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .warning-box {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">SlackCRM</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This email was sent from SlackCRM - AI-Powered Team CRM</p>
      <p>&copy; ${new Date().getFullYear()} SlackCRM. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Welcome email for new users
 */
export const welcomeEmail = (params: WelcomeEmailParams): { subject: string; html: string } => {
  const { userName, loginUrl, supportEmail = 'support@slackcrm.com' } = params;

  const content = `
    <h1>Welcome to SlackCRM, ${userName}!</h1>
    <p>We're excited to have you on board. Your account has been successfully created.</p>

    <div class="info-box">
      <p><strong>Getting Started:</strong></p>
      <ul>
        <li>Explore your dashboard and customize your workspace</li>
        <li>Import your contacts and set up your sales pipeline</li>
        <li>Invite team members to collaborate</li>
        <li>Connect integrations like Google Calendar and Slack</li>
      </ul>
    </div>

    <center>
      <a href="${loginUrl}" class="button">Go to Dashboard</a>
    </center>

    <p>If you have any questions, feel free to reach out to our support team at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
  `;

  return {
    subject: 'Welcome to SlackCRM!',
    html: baseTemplate(content, 'Welcome to SlackCRM'),
  };
};

/**
 * Password reset email
 */
export const passwordResetEmail = (params: PasswordResetParams): { subject: string; html: string } => {
  const { userName, resetUrl, expirationHours = 1 } = params;

  const content = `
    <h1>Password Reset Request</h1>
    <p>Hi ${userName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>

    <center>
      <a href="${resetUrl}" class="button">Reset Password</a>
    </center>

    <div class="warning-box">
      <p><strong>Important:</strong> This link will expire in ${expirationHours} hour${expirationHours > 1 ? 's' : ''}.</p>
    </div>

    <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
    <p>For security reasons, never share this link with anyone.</p>
  `;

  return {
    subject: 'Reset Your SlackCRM Password',
    html: baseTemplate(content, 'Password Reset'),
  };
};

/**
 * Task assigned notification
 */
export const taskAssignedEmail = (params: TaskAssignedParams): { subject: string; html: string } => {
  const { userName, taskTitle, taskDescription, dueDate, taskUrl } = params;

  const content = `
    <h1>New Task Assigned</h1>
    <p>Hi ${userName},</p>
    <p>You've been assigned a new task:</p>

    <div class="info-box">
      <p><strong>${taskTitle}</strong></p>
      ${taskDescription ? `<p>${taskDescription}</p>` : ''}
      ${dueDate ? `<p><strong>Due:</strong> ${dueDate}</p>` : ''}
    </div>

    <center>
      <a href="${taskUrl}" class="button">View Task</a>
    </center>

    <p>Log in to SlackCRM to update the task status or add comments.</p>
  `;

  return {
    subject: `New Task: ${taskTitle}`,
    html: baseTemplate(content, 'Task Assigned'),
  };
};

/**
 * Deal won celebration email
 */
export const dealWonEmail = (params: DealWonParams): { subject: string; html: string } => {
  const { dealTitle, dealValue, contactName, teamMemberName } = params;

  const content = `
    <h1>🎉 Deal Closed - Congratulations!</h1>
    <p>Great news! ${teamMemberName} just closed a deal:</p>

    <div class="info-box">
      <p><strong>${dealTitle}</strong></p>
      <p><strong>Value:</strong> ${dealValue}</p>
      <p><strong>Contact:</strong> ${contactName}</p>
      <p><strong>Closed by:</strong> ${teamMemberName}</p>
    </div>

    <p>Excellent work! Keep up the momentum.</p>
  `;

  return {
    subject: `🎉 Deal Won: ${dealTitle}`,
    html: baseTemplate(content, 'Deal Won'),
  };
};

/**
 * Generic workflow notification email
 */
export const workflowNotificationEmail = (params: WorkflowNotificationParams): { subject: string; html: string } => {
  const { title, message, actionUrl, actionText = 'View Details' } = params;

  const content = `
    <h1>${title}</h1>
    <p>${message}</p>

    ${actionUrl ? `
      <center>
        <a href="${actionUrl}" class="button">${actionText}</a>
      </center>
    ` : ''}
  `;

  return {
    subject: title,
    html: baseTemplate(content, title),
  };
};

/**
 * Daily digest email
 */
export const dailyDigestEmail = (params: {
  userName: string;
  date: string;
  stats: {
    newContacts: number;
    newDeals: number;
    completedTasks: number;
    revenue: string;
  };
  dashboardUrl: string;
}): { subject: string; html: string } => {
  const { userName, date, stats, dashboardUrl } = params;

  const content = `
    <h1>Daily Digest - ${date}</h1>
    <p>Hi ${userName},</p>
    <p>Here's your daily summary:</p>

    <div class="info-box">
      <p><strong>Today's Activity:</strong></p>
      <ul>
        <li>${stats.newContacts} new contacts added</li>
        <li>${stats.newDeals} new deals created</li>
        <li>${stats.completedTasks} tasks completed</li>
        <li>${stats.revenue} in revenue</li>
      </ul>
    </div>

    <center>
      <a href="${dashboardUrl}" class="button">View Dashboard</a>
    </center>

    <p>Keep up the great work!</p>
  `;

  return {
    subject: `Daily Digest - ${date}`,
    html: baseTemplate(content, 'Daily Digest'),
  };
};

/**
 * Team invitation email
 */
export const teamInvitationEmail = (params: {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  role: string;
}): { subject: string; html: string } => {
  const { inviterName, workspaceName, inviteUrl, role } = params;

  const content = `
    <h1>You've Been Invited!</h1>
    <p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on SlackCRM as a ${role}.</p>

    <center>
      <a href="${inviteUrl}" class="button">Accept Invitation</a>
    </center>

    <div class="info-box">
      <p><strong>What is SlackCRM?</strong></p>
      <p>SlackCRM is an AI-powered team CRM platform designed to help sales teams collaborate, manage contacts, close deals, and track performance.</p>
    </div>

    <p>Click the button above to create your account and get started!</p>
  `;

  return {
    subject: `Invitation to join ${workspaceName} on SlackCRM`,
    html: baseTemplate(content, 'Team Invitation'),
  };
};

export default {
  welcomeEmail,
  passwordResetEmail,
  taskAssignedEmail,
  dealWonEmail,
  workflowNotificationEmail,
  dailyDigestEmail,
  teamInvitationEmail,
};
