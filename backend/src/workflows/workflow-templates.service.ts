import { Injectable, Logger } from '@nestjs/common';
import { WorkflowTriggerType, WorkflowActionType } from '../database/entities/workflow.entity';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'lead-management' | 'sales' | 'customer-success' | 'automation';
  triggerType: WorkflowTriggerType;
  actions: any[];
  tags: string[];
  recommended: boolean;
}

@Injectable()
export class WorkflowTemplatesService {
  private readonly logger = new Logger(WorkflowTemplatesService.name);

  private readonly templates: WorkflowTemplate[] = [
    // Lead Management Templates
    {
      id: 'lead-nurture-sequence',
      name: 'Lead Nurture Sequence',
      description: 'Automatically nurture new leads with a series of follow-up emails over 2 weeks',
      category: 'lead-management',
      triggerType: WorkflowTriggerType.CONTACT_CREATED,
      recommended: true,
      tags: ['nurture', 'email', 'automation'],
      actions: [
        {
          id: 'email-1',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Welcome Email',
          config: {
            subject: 'Welcome {{firstName}}! Let\'s get started',
            body: `
              <p>Hi {{firstName}},</p>
              <p>Welcome! We're excited to have you here.</p>
              <p>Here are some resources to get you started...</p>
            `,
          },
          delay: 0,
        },
        {
          id: 'wait-1',
          type: WorkflowActionType.WAIT,
          name: 'Wait 3 days',
          config: { duration: 259200 }, // 3 days in seconds
        },
        {
          id: 'email-2',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Case Study',
          config: {
            subject: 'See how companies like yours succeed',
            body: `
              <p>Hi {{firstName}},</p>
              <p>I wanted to share a case study showing how we helped {{company}} achieve amazing results...</p>
            `,
          },
        },
        {
          id: 'wait-2',
          type: WorkflowActionType.WAIT,
          name: 'Wait 4 days',
          config: { duration: 345600 }, // 4 days
        },
        {
          id: 'email-3',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Follow-up',
          config: {
            subject: 'Quick question about {{company}}',
            body: `
              <p>Hi {{firstName}},</p>
              <p>I wanted to check in and see if you have any questions...</p>
            `,
          },
        },
        {
          id: 'task-1',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Create Follow-up Task',
          config: {
            title: 'Follow up with {{firstName}} {{lastName}}',
            priority: 'HIGH',
            dueInDays: 1,
          },
        },
      ],
    },

    {
      id: 'hot-lead-alert',
      name: 'Hot Lead Alert & Assignment',
      description: 'Instantly alert sales team and assign tasks when a hot lead is identified',
      category: 'lead-management',
      triggerType: WorkflowTriggerType.CONTACT_CREATED,
      recommended: true,
      tags: ['hot-lead', 'notification', 'task'],
      actions: [
        {
          id: 'condition-check',
          type: 'CONDITION',
          name: 'Check if Hot Lead',
          condition: {
            field: 'leadScore',
            operator: 'greater_than',
            value: 80,
          },
        },
        {
          id: 'add-tag',
          type: WorkflowActionType.ADD_TAG,
          name: 'Tag as Hot Lead',
          config: {
            tags: ['hot-lead', 'priority'],
          },
        },
        {
          id: 'task-1',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Create Urgent Follow-up',
          config: {
            title: 'URGENT: Call {{firstName}} {{lastName}} - Hot Lead',
            priority: 'HIGH',
            dueInDays: 0, // Today
            description: 'This is a hot lead with score > 80. Call within 24 hours!',
          },
        },
        {
          id: 'email-sales-team',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Notify Sales Team',
          config: {
            to: 'sales-team@company.com',
            subject: 'Hot Lead Alert: {{firstName}} {{lastName}}',
            body: `
              <h2>New Hot Lead Detected!</h2>
              <p><strong>Name:</strong> {{firstName}} {{lastName}}</p>
              <p><strong>Company:</strong> {{company}}</p>
              <p><strong>Score:</strong> {{leadScore}}</p>
              <p><a href="{{crmLink}}">View in CRM</a></p>
            `,
          },
        },
      ],
    },

    {
      id: 'abandoned-deal-recovery',
      name: 'Abandoned Deal Recovery',
      description: 'Automatically reach out when a deal has been inactive for 7 days',
      category: 'sales',
      triggerType: WorkflowTriggerType.SCHEDULE,
      recommended: true,
      tags: ['deal', 'recovery', 'follow-up'],
      actions: [
        {
          id: 'check-inactive',
          type: 'CONDITION',
          name: 'Check if Deal Inactive > 7 days',
          condition: {
            field: 'lastActivityDate',
            operator: 'older_than',
            value: 7, // days
          },
        },
        {
          id: 'task-1',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Create Re-engagement Task',
          config: {
            title: 'Re-engage: {{dealName}}',
            priority: 'MEDIUM',
            dueInDays: 1,
            description: 'This deal has been inactive for 7+ days. Reach out to re-engage.',
          },
        },
        {
          id: 'email-1',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Re-engagement Email',
          config: {
            subject: 'Checking in on {{dealName}}',
            body: `
              <p>Hi {{firstName}},</p>
              <p>I wanted to check in regarding {{dealName}}. Are you still interested in moving forward?</p>
              <p>I'm happy to answer any questions or schedule a call to discuss next steps.</p>
            `,
          },
        },
      ],
    },

    {
      id: 'deal-won-onboarding',
      name: 'Deal Won - Customer Onboarding',
      description: 'Automatically start onboarding process when a deal is won',
      category: 'customer-success',
      triggerType: WorkflowTriggerType.DEAL_WON,
      recommended: true,
      tags: ['onboarding', 'customer-success', 'automation'],
      actions: [
        {
          id: 'email-congrats',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Congratulations Email',
          config: {
            subject: 'Welcome aboard, {{firstName}}!',
            body: `
              <h2>Congratulations!</h2>
              <p>We're thrilled to have {{company}} as a customer!</p>
              <p>Here's what happens next:</p>
              <ol>
                <li>You'll receive onboarding materials within 24 hours</li>
                <li>Your dedicated account manager will reach out</li>
                <li>We'll schedule a kickoff call</li>
              </ol>
            `,
          },
        },
        {
          id: 'task-onboarding',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Create Onboarding Tasks',
          config: {
            title: 'Start onboarding for {{company}}',
            priority: 'HIGH',
            dueInDays: 1,
            description: 'Send onboarding materials and schedule kickoff call',
          },
        },
        {
          id: 'webhook-crm',
          type: WorkflowActionType.SEND_WEBHOOK,
          name: 'Notify Onboarding System',
          config: {
            url: 'https://your-system.com/api/onboarding',
            method: 'POST',
            body: {
              customerId: '{{contactId}}',
              dealId: '{{dealId}}',
              companyName: '{{company}}',
            },
          },
        },
        {
          id: 'wait-1',
          type: WorkflowActionType.WAIT,
          name: 'Wait 7 days',
          config: { duration: 604800 }, // 7 days
        },
        {
          id: 'email-checkin',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send First Check-in',
          config: {
            subject: 'How is your first week going?',
            body: `
              <p>Hi {{firstName}},</p>
              <p>I wanted to check in and see how your first week has been!</p>
              <p>Do you have any questions or need any help?</p>
            `,
          },
        },
      ],
    },

    {
      id: 'deal-lost-feedback',
      name: 'Deal Lost - Collect Feedback',
      description: 'Automatically request feedback when a deal is lost to improve process',
      category: 'sales',
      triggerType: WorkflowTriggerType.DEAL_LOST,
      recommended: false,
      tags: ['feedback', 'improvement', 'deal-lost'],
      actions: [
        {
          id: 'wait-1',
          type: WorkflowActionType.WAIT,
          name: 'Wait 2 days',
          config: { duration: 172800 }, // 2 days - give them space
        },
        {
          id: 'email-feedback',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Request Feedback',
          config: {
            subject: 'Quick feedback about our process?',
            body: `
              <p>Hi {{firstName}},</p>
              <p>I understand you decided to go in a different direction, and that's totally okay!</p>
              <p>If you have 2 minutes, I'd love your feedback to help us improve:</p>
              <p><a href="{{feedbackFormUrl}}">Share Your Feedback</a></p>
              <p>Thank you, and I wish you all the best!</p>
            `,
          },
        },
        {
          id: 'task-analyze',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Analyze Lost Reason',
          config: {
            title: 'Analyze why deal was lost: {{dealName}}',
            priority: 'LOW',
            dueInDays: 7,
            description: 'Review deal and understand why it was lost to improve process',
          },
        },
      ],
    },

    {
      id: 'inactive-contact-reengagement',
      name: 'Inactive Contact Re-engagement',
      description: 'Automatically re-engage contacts that haven\'t had activity in 30 days',
      category: 'automation',
      triggerType: WorkflowTriggerType.SCHEDULE,
      recommended: false,
      tags: ['re-engagement', 'nurture', 'automation'],
      actions: [
        {
          id: 'condition-check',
          type: 'CONDITION',
          name: 'Check if Inactive > 30 days',
          condition: {
            field: 'lastActivityDate',
            operator: 'older_than',
            value: 30,
          },
        },
        {
          id: 'email-reengagement',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Re-engagement Email',
          config: {
            subject: 'We\'d love to reconnect, {{firstName}}',
            body: `
              <p>Hi {{firstName}},</p>
              <p>It's been a while since we connected! I wanted to reach out and see how things are going at {{company}}.</p>
              <p>We have some exciting updates that might interest you...</p>
            `,
          },
        },
        {
          id: 'add-tag',
          type: WorkflowActionType.ADD_TAG,
          name: 'Tag as Re-engagement Attempt',
          config: {
            tags: ['re-engagement-attempt'],
          },
        },
      ],
    },

    {
      id: 'high-value-deal-notification',
      name: 'High-Value Deal Notification',
      description: 'Notify management team when a high-value deal is created',
      category: 'sales',
      triggerType: WorkflowTriggerType.DEAL_CREATED,
      recommended: false,
      tags: ['high-value', 'notification', 'management'],
      actions: [
        {
          id: 'condition-check',
          type: 'CONDITION',
          name: 'Check if Deal Value > $50k',
          condition: {
            field: 'dealValue',
            operator: 'greater_than',
            value: 50000,
          },
        },
        {
          id: 'email-management',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Notify Management',
          config: {
            to: 'management@company.com',
            subject: 'High-Value Deal Alert: $' + '{{dealValue}}',
            body: '<h2>New High-Value Deal Created</h2>' +
              '<p><strong>Deal:</strong> {{dealName}}</p>' +
              '<p><strong>Value:</strong> ${{dealValue}}</p>' +
              '<p><strong>Contact:</strong> {{firstName}} {{lastName}}</p>' +
              '<p><strong>Company:</strong> {{company}}</p>' +
              '<p><a href="{{dealLink}}">View Deal in CRM</a></p>',
          },
        },
        {
          id: 'task-review',
          type: WorkflowActionType.CREATE_TASK,
          name: 'Schedule Management Review',
          config: {
            title: 'Management review needed: {{dealName}}',
            priority: 'HIGH',
            dueInDays: 2,
            description: 'High-value deal requires management oversight',
            assignTo: 'manager',
          },
        },
      ],
    },

    {
      id: 'daily-digest',
      name: 'Daily Activity Digest',
      description: 'Send daily summary of activities, tasks, and deals to team',
      category: 'automation',
      triggerType: WorkflowTriggerType.SCHEDULE,
      recommended: false,
      tags: ['digest', 'reporting', 'daily'],
      actions: [
        {
          id: 'email-digest',
          type: WorkflowActionType.SEND_EMAIL,
          name: 'Send Daily Digest',
          config: {
            subject: 'Your Daily CRM Digest - {{date}}',
            body: `
              <h2>Daily Summary</h2>
              <h3>Today's Tasks</h3>
              <p>{{tasksSummary}}</p>
              <h3>New Leads</h3>
              <p>{{newLeadsSummary}}</p>
              <h3>Deal Updates</h3>
              <p>{{dealsSummary}}</p>
            `,
          },
          schedule: {
            time: '09:00',
            timezone: 'UTC',
          },
        },
      ],
    },
  ];

  /**
   * Get all available workflow templates
   */
  getAllTemplates(filters?: {
    category?: string;
    recommended?: boolean;
    tags?: string[];
  }): WorkflowTemplate[] {
    let templates = [...this.templates];

    if (filters?.category) {
      templates = templates.filter(t => t.category === filters.category);
    }

    if (filters?.recommended !== undefined) {
      templates = templates.filter(t => t.recommended === filters.recommended);
    }

    if (filters?.tags && filters.tags.length > 0) {
      templates = templates.filter(t =>
        filters.tags.some(tag => t.tags.includes(tag))
      );
    }

    return templates;
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.find(t => t.id === templateId);
  }

  /**
   * Get recommended templates for a workspace
   */
  getRecommendedTemplates(): WorkflowTemplate[] {
    return this.templates.filter(t => t.recommended);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.templates.filter(t => t.category === category);
  }

  /**
   * Search templates
   */
  searchTemplates(query: string): WorkflowTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get template categories
   */
  getCategories(): string[] {
    return [...new Set(this.templates.map(t => t.category))];
  }

  /**
   * Get all tags
   */
  getAllTags(): string[] {
    const allTags = this.templates.flatMap(t => t.tags);
    return [...new Set(allTags)];
  }
}
