import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactStatus, ContactSource } from '../../database/entities/contact.entity';
import { Deal, DealStage } from '../../database/entities/deal.entity';
import { Activity } from '../../database/entities/activity.entity';
import { ContactsService } from '../../contacts/contacts.service';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Deal)
    private dealRepository: Repository<Deal>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @Inject(forwardRef(() => ContactsService))
    private contactsService: ContactsService,
  ) {}

  async handleEvent(body: any, headers: any) {
    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // TODO: Handle various Slack events
    this.logger.log(`Received Slack event: ${body.event?.type}`);
    return { message: 'Event received', event: body.event };
  }

  async handleCommand(body: any, headers: any) {
    const { command, text, user_id, channel_id, team_id } = body;

    this.logger.log(`Received command: ${command} with text: ${text}`);

    try {
      switch (command) {
        case '/crm-add':
          return await this.handleAddContact(text, user_id, team_id);

        case '/crm-search':
          return await this.handleSearchContact(text, team_id);

        case '/crm-tag':
          return await this.handleTagContact(text, team_id);

        case '/crm-stats':
          return await this.handleStats(team_id);

        case '/crm-follow-up':
          return await this.handleFollowUp(text, team_id);

        case '/crm-lost':
          return await this.handleMarkLost(text, team_id);

        case '/crm-high-ticket':
          return await this.handleMarkHighTicket(text, team_id);

        case '/crm-low-ticket':
          return await this.handleMarkLowTicket(text, team_id);

        case '/crm-help':
          return this.handleHelp();

        default:
          return {
            response_type: 'ephemeral',
            text: `Unknown command: ${command}. Use /crm-help to see available commands.`,
          };
      }
    } catch (error) {
      this.logger.error(`Error handling command ${command}: ${error.message}`);
      return {
        response_type: 'ephemeral',
        text: `Error: ${error.message}`,
      };
    }
  }

  private async handleAddContact(text: string, userId: string, teamId: string) {
    // Parse text: email|firstName|lastName|phone
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-add email|firstName|lastName|phone\nExample: /crm-add john@example.com|John|Doe|+1234567890',
      };
    }

    const [email, firstName, lastName, phone] = parts;

    try {
      const contact = this.contactRepository.create({
        email,
        firstName,
        lastName,
        phone: phone || null,
        workspaceId: teamId,
        source: ContactSource.SLACK,
        status: ContactStatus.LEAD,
        leadScore: 0,
      });

      contact.updateLeadScore();
      await this.contactRepository.save(contact);

      return {
        response_type: 'in_channel',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Contact Added Successfully!*`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Name:*\n${firstName} ${lastName}`,
              },
              {
                type: 'mrkdwn',
                text: `*Email:*\n${email}`,
              },
              {
                type: 'mrkdwn',
                text: `*Phone:*\n${phone || 'N/A'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Lead Score:*\n${contact.leadScore}/100`,
              },
            ],
          },
        ],
      };
    } catch (error) {
      return {
        response_type: 'ephemeral',
        text: `❌ Failed to add contact: ${error.message}`,
      };
    }
  }

  private async handleSearchContact(text: string, teamId: string) {
    if (!text || text.trim() === '') {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-search <email or name>\nExample: /crm-search john@example.com',
      };
    }

    const searchTerm = text.trim();

    const contacts = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :teamId', { teamId })
      .andWhere(
        '(contact.email ILIKE :search OR contact.firstName ILIKE :search OR contact.lastName ILIKE :search)',
        { search: `%${searchTerm}%` }
      )
      .take(10)
      .getMany();

    if (contacts.length === 0) {
      return {
        response_type: 'ephemeral',
        text: `No contacts found for "${searchTerm}"`,
      };
    }

    const fields = contacts.map(c => ({
      type: 'mrkdwn',
      text: `*${c.fullName}*\n${c.email} | Status: ${c.status} | Score: ${c.leadScore}\nTags: ${c.tags?.join(', ') || 'none'}`,
    }));

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔍 Found ${contacts.length} contact(s) for *"${searchTerm}"*:`,
          },
        },
        {
          type: 'section',
          fields,
        },
      ],
    };
  }

  private async handleTagContact(text: string, teamId: string) {
    // Format: email tag1,tag2,tag3
    const parts = text.split(' ');
    if (parts.length < 2) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-tag <email> <tag1,tag2,tag3>\nExample: /crm-tag john@example.com high-ticket,follow-up',
      };
    }

    const email = parts[0].trim();
    const tags = parts[1].split(',').map(t => t.trim());

    const contact = await this.contactRepository.findOne({
      where: { email, workspaceId: teamId },
    });

    if (!contact) {
      return {
        response_type: 'ephemeral',
        text: `❌ Contact not found: ${email}`,
      };
    }

    const currentTags = contact.tags || [];
    const newTags = tags.filter(tag => !currentTags.includes(tag));

    if (newTags.length > 0) {
      contact.tags = [...currentTags, ...newTags];
      await this.contactRepository.save(contact);
    }

    return {
      response_type: 'in_channel',
      text: `✅ Added tags to *${contact.fullName}*: ${newTags.join(', ')}\nAll tags: ${contact.tags.join(', ')}`,
    };
  }

  private async handleStats(teamId: string, userId?: string) {
    // Show all stats for workspace - Slack users see workspace-wide stats
    const overview = await this.contactsService.getAnalyticsOverview(teamId);

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 CRM Analytics Overview',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Contacts:*\n${overview.total}`,
            },
            {
              type: 'mrkdwn',
              text: `*Conversion Rate:*\n${overview.conversionRate}%`,
            },
            {
              type: 'mrkdwn',
              text: `*Avg Lead Score:*\n${overview.averageLeadScore}/100`,
            },
            {
              type: 'mrkdwn',
              text: `*Recently Added:*\n${overview.recentlyAdded}`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*By Tag:*',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `🎯 *High Ticket:*\n${overview.highTicketLeads}`,
            },
            {
              type: 'mrkdwn',
              text: `💰 *Low Ticket:*\n${overview.lowTicketLeads}`,
            },
            {
              type: 'mrkdwn',
              text: `📞 *Follow Up:*\n${overview.followUpNeeded}`,
            },
            {
              type: 'mrkdwn',
              text: `❌ *Lost:*\n${overview.lostLeads}`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*By Status:*',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `🆕 Leads: ${overview.byStatus.lead || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `🎯 Prospects: ${overview.byStatus.prospect || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `✅ Qualified: ${overview.byStatus.qualified || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `⭐ Customers: ${overview.byStatus.customer || 0}`,
            },
          ],
        },
      ],
    };
  }

  private async handleFollowUp(text: string, teamId: string) {
    const email = text.trim();

    if (!email) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-follow-up <email>\nExample: /crm-follow-up john@example.com',
      };
    }

    const contact = await this.contactRepository.findOne({
      where: { email, workspaceId: teamId },
    });

    if (!contact) {
      return {
        response_type: 'ephemeral',
        text: `❌ Contact not found: ${email}`,
      };
    }

    const currentTags = contact.tags || [];
    if (!currentTags.includes('follow-up')) {
      contact.tags = [...currentTags, 'follow-up'];
      await this.contactRepository.save(contact);
    }

    return {
      response_type: 'in_channel',
      text: `✅ Marked *${contact.fullName}* for follow-up 📞`,
    };
  }

  private async handleMarkLost(text: string, teamId: string) {
    const email = text.trim();

    if (!email) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-lost <email>\nExample: /crm-lost john@example.com',
      };
    }

    const contact = await this.contactRepository.findOne({
      where: { email, workspaceId: teamId },
    });

    if (!contact) {
      return {
        response_type: 'ephemeral',
        text: `❌ Contact not found: ${email}`,
      };
    }

    const currentTags = contact.tags || [];
    if (!currentTags.includes('lost')) {
      contact.tags = [...currentTags, 'lost'];
      await this.contactRepository.save(contact);
    }

    return {
      response_type: 'in_channel',
      text: `✅ Marked *${contact.fullName}* as lost ❌`,
    };
  }

  private async handleMarkHighTicket(text: string, teamId: string) {
    const email = text.trim();

    if (!email) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-high-ticket <email>\nExample: /crm-high-ticket john@example.com',
      };
    }

    const contact = await this.contactRepository.findOne({
      where: { email, workspaceId: teamId },
    });

    if (!contact) {
      return {
        response_type: 'ephemeral',
        text: `❌ Contact not found: ${email}`,
      };
    }

    const currentTags = contact.tags || [];
    // Remove low-ticket if present
    const filteredTags = currentTags.filter(t => t !== 'low-ticket');
    if (!filteredTags.includes('high-ticket')) {
      contact.tags = [...filteredTags, 'high-ticket'];
      await this.contactRepository.save(contact);
    }

    return {
      response_type: 'in_channel',
      text: `✅ Marked *${contact.fullName}* as high-ticket 🎯💰`,
    };
  }

  private async handleMarkLowTicket(text: string, teamId: string) {
    const email = text.trim();

    if (!email) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /crm-low-ticket <email>\nExample: /crm-low-ticket john@example.com',
      };
    }

    const contact = await this.contactRepository.findOne({
      where: { email, workspaceId: teamId },
    });

    if (!contact) {
      return {
        response_type: 'ephemeral',
        text: `❌ Contact not found: ${email}`,
      };
    }

    const currentTags = contact.tags || [];
    // Remove high-ticket if present
    const filteredTags = currentTags.filter(t => t !== 'high-ticket');
    if (!filteredTags.includes('low-ticket')) {
      contact.tags = [...filteredTags, 'low-ticket'];
      await this.contactRepository.save(contact);
    }

    return {
      response_type: 'in_channel',
      text: `✅ Marked *${contact.fullName}* as low-ticket 💰`,
    };
  }

  private handleHelp() {
    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🤖 CRM Slack Commands Help',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Available Commands:*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `
*Adding Contacts:*
• \`/crm-add email|firstName|lastName|phone\`
  Example: \`/crm-add john@example.com|John|Doe|+1234567890\`

*Searching:*
• \`/crm-search <email or name>\`
  Example: \`/crm-search john@example.com\`

*Tagging:*
• \`/crm-tag <email> <tag1,tag2>\`
  Example: \`/crm-tag john@example.com high-ticket,follow-up\`
• \`/crm-high-ticket <email>\` - Mark as high-ticket lead
• \`/crm-low-ticket <email>\` - Mark as low-ticket lead
• \`/crm-follow-up <email>\` - Mark for follow-up
• \`/crm-lost <email>\` - Mark as lost

*Analytics:*
• \`/crm-stats\` - View CRM statistics

*Help:*
• \`/crm-help\` - Show this help message
            `,
          },
        },
      ],
    };
  }

  async handleInteractive(body: any, headers: any) {
    // Parse the payload if it's a string
    const payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;

    this.logger.log(`Received interactive component: ${payload.type}`);

    // TODO: Handle button clicks, modal submissions, etc.
    return { message: 'Interactive component handled' };
  }

  async handleOAuth(body: any) {
    // TODO: Handle OAuth flow for workspace installation
    this.logger.log('OAuth flow initiated');
    return { message: 'OAuth handled', code: body.code };
  }

  async sendMessage(channel: string, text: string, blocks?: any[]) {
    // TODO: Implement message sending via Slack Web API
    this.logger.log(`Sending message to channel ${channel}: ${text}`);
    return { message: 'Message sent', channel, text };
  }
}
