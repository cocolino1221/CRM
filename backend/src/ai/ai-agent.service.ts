import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Contact } from '../database/entities/contact.entity';
import { Task, TaskStatus, TaskPriority } from '../database/entities/task.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { ContactsService } from '../contacts/contacts.service';
import { EmailService } from '../email/email.service';

export interface LeadAnalysis {
  score: number;
  qualification: 'hot' | 'warm' | 'cold';
  recommendations: string[];
  nextActions: string[];
}

@Injectable()
export class AIAgentService {
  private readonly logger = new Logger(AIAgentService.name);
  private readonly apiKey: string;

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    private readonly contactsService: ContactsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  /**
   * Analyze a lead and provide qualification score
   */
  async analyzeLead(contactId: string, workspaceId: string): Promise<LeadAnalysis> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId },
      relations: ['deals', 'activities', 'tasks'],
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    let score = 0;
    const recommendations: string[] = [];
    const nextActions: string[] = [];

    // Scoring logic
    if (contact.email) score += 10;
    if (contact.phone) score += 10;
    if (contact.company) score += 15;
    if (contact.jobTitle) score += 10;
    if (contact.customFields?.website) score += 5;

    // Check engagement
    if (contact.activities && contact.activities.length > 0) {
      score += Math.min(contact.activities.length * 5, 20);
    }

    // Check if has deal
    if (contact.deals && contact.deals.length > 0) {
      score += 20;
      const hasOpenDeal = contact.deals.some(d => d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST);
      if (hasOpenDeal) score += 10;
    }

    // Check custom fields for budget/timeline indicators
    if (contact.customFields) {
      if (contact.customFields.budget && parseInt(contact.customFields.budget) > 10000) {
        score += 15;
        recommendations.push('High budget detected - prioritize this lead');
      }
      if (contact.customFields.timeline === 'immediate') {
        score += 10;
        recommendations.push('Immediate timeline - fast follow-up required');
      }
    }

    // Determine qualification
    let qualification: 'hot' | 'warm' | 'cold';
    if (score >= 70) {
      qualification = 'hot';
      nextActions.push('Schedule demo call within 24 hours');
      nextActions.push('Send personalized proposal');
    } else if (score >= 40) {
      qualification = 'warm';
      nextActions.push('Send follow-up email with case studies');
      nextActions.push('Schedule discovery call this week');
    } else {
      qualification = 'cold';
      nextActions.push('Add to nurture email campaign');
      nextActions.push('Gather more information before outreach');
    }

    // Check for missing information
    if (!contact.company) {
      recommendations.push('Missing company information - research and update');
    }
    if (!contact.jobTitle) {
      recommendations.push('Missing job title - verify decision maker status');
    }
    if (!contact.phone && !contact.email) {
      recommendations.push('URGENT: No contact method available');
    }

    this.logger.log(`Lead ${contact.email} analyzed: Score ${score}, Qualification: ${qualification}`);

    return {
      score,
      qualification,
      recommendations,
      nextActions,
    };
  }

  /**
   * Auto-create tasks for a lead based on qualification
   */
  async createLeadTasks(contactId: string, workspaceId: string, userId: string): Promise<Task[]> {
    const analysis = await this.analyzeLead(contactId, workspaceId);
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId },
    });

    const tasks: Task[] = [];

    for (const action of analysis.nextActions) {
      const task = this.taskRepository.create({
        workspaceId,
        title: action,
        description: `Auto-generated task for ${contact.firstName} ${contact.lastName} (${analysis.qualification} lead, score: ${analysis.score})`,
        priority: analysis.qualification === 'hot' ? TaskPriority.HIGH : analysis.qualification === 'warm' ? TaskPriority.MEDIUM : TaskPriority.LOW,
        status: TaskStatus.PENDING,
        dueDate: this.calculateDueDate(analysis.qualification),
        assigneeId: userId,
        contactId: contact.id,
      });

      const savedTask = await this.taskRepository.save(task);
      tasks.push(savedTask);
    }

    this.logger.log(`Created ${tasks.length} tasks for lead ${contact.email}`);
    return tasks;
  }

  /**
   * Send automated email based on lead qualification
   */
  async sendQualificationEmail(contactId: string, workspaceId: string): Promise<void> {
    const analysis = await this.analyzeLead(contactId, workspaceId);
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId },
    });

    if (!contact.email) {
      throw new Error('Contact has no email address');
    }

    let template: string;
    let subject: string;

    switch (analysis.qualification) {
      case 'hot':
        subject = `${contact.firstName}, let's schedule a demo`;
        template = this.getHotLeadEmailTemplate(contact, analysis);
        break;
      case 'warm':
        subject = `${contact.firstName}, see how we can help ${contact.company || 'your business'}`;
        template = this.getWarmLeadEmailTemplate(contact, analysis);
        break;
      case 'cold':
        subject = `Resources for ${contact.company || 'you'}`;
        template = this.getColdLeadEmailTemplate(contact, analysis);
        break;
    }

    await this.emailService.sendEmail({
      to: contact.email,
      subject,
      html: template,
    });

    this.logger.log(`Sent ${analysis.qualification} lead email to ${contact.email}`);
  }

  /**
   * Enrich contact data using AI
   */
  async enrichContact(contactId: string, workspaceId: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    // If we have OpenAI API key, use it for enrichment
    if (this.apiKey) {
      try {
        const enrichedData = await this.callOpenAI(contact);

        // Update contact with enriched data
        Object.assign(contact, enrichedData);
        await this.contactRepository.save(contact);

        this.logger.log(`Enriched contact ${contact.email} with AI`);
      } catch (error) {
        this.logger.error(`Failed to enrich contact with AI: ${error.message}`);
      }
    }

    return contact;
  }

  /**
   * Process new lead: analyze, create tasks, and send email
   */
  async processNewLead(contactId: string, workspaceId: string, userId: string): Promise<{
    analysis: LeadAnalysis;
    tasks: Task[];
    emailSent: boolean;
  }> {
    this.logger.log(`Processing new lead: ${contactId}`);

    // Run in parallel
    const [analysis, tasks] = await Promise.all([
      this.analyzeLead(contactId, workspaceId),
      this.createLeadTasks(contactId, workspaceId, userId),
    ]);

    // Send email only for qualified leads
    let emailSent = false;
    if (analysis.qualification !== 'cold') {
      try {
        await this.sendQualificationEmail(contactId, workspaceId);
        emailSent = true;
      } catch (error) {
        this.logger.error(`Failed to send email: ${error.message}`);
      }
    }

    return {
      analysis,
      tasks,
      emailSent,
    };
  }

  private calculateDueDate(qualification: 'hot' | 'warm' | 'cold'): Date {
    const now = new Date();
    switch (qualification) {
      case 'hot':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      case 'warm':
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
      case 'cold':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }
  }

  private getHotLeadEmailTemplate(contact: Contact, analysis: LeadAnalysis): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Hi ${contact.firstName},</h2>

          <p>I noticed you recently connected with us${contact.company ? ` from ${contact.company}` : ''}. Based on your profile, I think we could provide significant value.</p>

          <p><strong>Why reach out now?</strong></p>
          <ul>
            ${analysis.recommendations.map(r => `<li>${r}</li>`).join('')}
          </ul>

          <p>I'd love to show you a quick demo of how we've helped companies like yours. Are you available for a 15-minute call this week?</p>

          <p><a href="YOUR_CALENDAR_LINK" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Schedule a Demo</a></p>

          <p>Looking forward to connecting!</p>

          <p>Best regards,<br>Your Sales Team</p>
        </body>
      </html>
    `;
  }

  private getWarmLeadEmailTemplate(contact: Contact, analysis: LeadAnalysis): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Hi ${contact.firstName},</h2>

          <p>Thanks for your interest in our solution! I wanted to share some resources that might be helpful${contact.company ? ` for ${contact.company}` : ''}.</p>

          <p><strong>Next Steps:</strong></p>
          <ul>
            ${analysis.nextActions.map(a => `<li>${a}</li>`).join('')}
          </ul>

          <p>I've attached a case study showing how we helped a similar company achieve [specific results].</p>

          <p>Would you be open to a brief call to discuss your specific needs?</p>

          <p><a href="YOUR_CALENDAR_LINK" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Book a Call</a></p>

          <p>Best,<br>Your Sales Team</p>
        </body>
      </html>
    `;
  }

  private getColdLeadEmailTemplate(contact: Contact, analysis: LeadAnalysis): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Hi ${contact.firstName},</h2>

          <p>Welcome! We're excited to have you in our community.</p>

          <p>To help you get started, here are some valuable resources:</p>
          <ul>
            <li>Our latest industry report</li>
            <li>Best practices guide</li>
            <li>Customer success stories</li>
          </ul>

          <p>Feel free to explore at your own pace. When you're ready to learn more about how we can help${contact.company ? ` ${contact.company}` : ''}, just reply to this email!</p>

          <p>Best regards,<br>Your Team</p>
        </body>
      </html>
    `;
  }

  /**
   * Process natural language query to search CRM data
   */
  async processNaturalLanguageQuery(query: string, workspaceId: string): Promise<any> {
    this.logger.log(`Processing NL query: ${query}`);

    // Parse query intent
    const intent = this.parseQueryIntent(query);

    switch (intent.type) {
      case 'search_contacts':
        return this.searchContacts(intent.params, workspaceId);
      case 'search_deals':
        return this.searchDeals(intent.params, workspaceId);
      case 'get_stats':
        return this.getStats(intent.params, workspaceId);
      default:
        return {
          success: false,
          message: 'Could not understand query. Please try rephrasing.',
          suggestions: [
            'Show me hot leads',
            'Find contacts from Acme Corp',
            'What are my open deals?',
            'Show today\'s tasks',
          ],
        };
    }
  }

  /**
   * AI chat assistant
   */
  async chat(message: string, workspaceId: string, conversationHistory?: any[]): Promise<any> {
    this.logger.log(`AI chat message: ${message}`);

    // If OpenAI API key available, use it
    if (this.apiKey) {
      try {
        // Would integrate with OpenAI Chat API here
        return {
          response: 'I can help you with your CRM. Try asking about leads, contacts, or deals.',
          suggestions: [
            'Show me my top leads',
            'What tasks are due today?',
            'Find contacts without a deal',
          ],
        };
      } catch (error) {
        this.logger.error(`Chat error: ${error.message}`);
      }
    }

    // Fallback to rule-based responses
    return this.getRuleBasedChatResponse(message, workspaceId);
  }

  /**
   * Analyze sentiment from text
   */
  async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    confidence: number;
    keywords: string[];
  }> {
    this.logger.log(`Analyzing sentiment for text of length ${text.length}`);

    // Simple keyword-based sentiment analysis
    const positiveWords = ['great', 'excellent', 'happy', 'pleased', 'satisfied', 'love', 'perfect', 'amazing', 'fantastic', 'wonderful'];
    const negativeWords = ['bad', 'poor', 'disappointed', 'unhappy', 'frustrated', 'terrible', 'awful', 'hate', 'worst', 'horrible'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    let sentiment: 'positive' | 'negative' | 'neutral';
    let score: number;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      score = Math.min((positiveCount / (positiveCount + negativeCount)) * 100, 100);
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      score = Math.min((negativeCount / (positiveCount + negativeCount)) * 100, 100);
    } else {
      sentiment = 'neutral';
      score = 50;
    }

    return {
      sentiment,
      score,
      confidence: Math.min((positiveCount + negativeCount) / 10 * 100, 95),
      keywords: [...positiveWords.filter(w => lowerText.includes(w)), ...negativeWords.filter(w => lowerText.includes(w))],
    };
  }

  /**
   * Get AI recommendations for a deal
   */
  async getDealRecommendations(dealId: string, workspaceId: string): Promise<any> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId, workspaceId },
      relations: ['contact', 'activities'],
    });

    if (!deal) {
      throw new Error('Deal not found');
    }

    const recommendations = [];
    const nextActions = [];

    // Analyze deal stage and age
    const daysSinceCreated = Math.floor((Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceCreated > 30 && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost') {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: 'Deal has been open for over 30 days - consider follow-up',
        action: 'Schedule follow-up call',
      });
      nextActions.push('Schedule a follow-up call to re-engage');
    }

    // Check activity level
    if (!deal.activities || deal.activities.length === 0) {
      recommendations.push({
        type: 'action',
        priority: 'high',
        message: 'No activities logged - start engagement',
        action: 'Log first interaction',
      });
      nextActions.push('Log your first interaction with this contact');
    }

    // Check deal value
    if (deal.value && deal.value > 50000) {
      recommendations.push({
        type: 'info',
        priority: 'medium',
        message: 'High-value deal - consider involving senior team member',
        action: 'Request manager review',
      });
      nextActions.push('Have a senior team member review this deal');
    }

    // Stage-specific recommendations
    switch (deal.stage) {
      case 'lead':
        nextActions.push('Qualify the lead and move to proposal stage');
        break;
      case 'proposal':
        nextActions.push('Send proposal document and schedule review call');
        break;
      case 'negotiation':
        nextActions.push('Address objections and finalize terms');
        break;
      case 'closed_won':
        nextActions.push('Send onboarding materials and schedule kickoff');
        break;
    }

    return {
      dealId,
      dealStage: deal.stage,
      dealValue: deal.value,
      recommendations,
      nextActions,
      insights: {
        daysSinceCreated,
        activityCount: deal.activities?.length || 0,
        healthScore: this.calculateDealHealthScore(deal),
      },
    };
  }

  /**
   * Generate email content using AI
   */
  async generateEmail(context: string, tone = 'professional', purpose = 'follow-up'): Promise<any> {
    this.logger.log(`Generating email: tone=${tone}, purpose=${purpose}`);

    // Template-based email generation
    const templates = {
      'follow-up': {
        subject: 'Following up on our conversation',
        body: `Hi {{firstName}},\n\nI wanted to follow up on our recent conversation about {{topic}}.\n\n{{context}}\n\nWould you be available for a quick call this week to discuss next steps?\n\nBest regards,\n{{senderName}}`,
      },
      'introduction': {
        subject: 'Introduction - {{companyName}}',
        body: `Hi {{firstName}},\n\nI hope this email finds you well. I wanted to reach out because {{reason}}.\n\n{{context}}\n\nI'd love to learn more about your needs and see if we can help. Are you available for a brief call?\n\nLooking forward to connecting,\n{{senderName}}`,
      },
      'proposal': {
        subject: 'Proposal for {{companyName}}',
        body: `Hi {{firstName}},\n\nThank you for the opportunity to present our solution.\n\n{{context}}\n\nI've attached a proposal that outlines how we can help {{companyName}} achieve {{goals}}.\n\nLet's schedule a call to review and answer any questions.\n\nBest regards,\n{{senderName}}`,
      },
    };

    const template = templates[purpose] || templates['follow-up'];

    return {
      subject: template.subject,
      body: template.body,
      tone,
      purpose,
      variables: ['firstName', 'companyName', 'topic', 'senderName', 'reason', 'goals'],
      tips: [
        'Personalize the email with specific details',
        'Keep it concise and focused',
        'Include a clear call-to-action',
        'Proofread before sending',
      ],
    };
  }

  // Helper methods
  private parseQueryIntent(query: string): any {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('contact') || lowerQuery.includes('lead')) {
      return { type: 'search_contacts', params: { query } };
    }
    if (lowerQuery.includes('deal')) {
      return { type: 'search_deals', params: { query } };
    }
    if (lowerQuery.includes('stat') || lowerQuery.includes('report') || lowerQuery.includes('how many')) {
      return { type: 'get_stats', params: { query } };
    }

    return { type: 'unknown', params: {} };
  }

  private async searchContacts(params: any, workspaceId: string): Promise<any> {
    // Simplified search - would integrate with full search in production
    const contacts = await this.contactRepository.find({
      where: { workspaceId },
      take: 10,
    });

    return {
      success: true,
      type: 'contacts',
      results: contacts,
      count: contacts.length,
    };
  }

  private async searchDeals(params: any, workspaceId: string): Promise<any> {
    const deals = await this.dealRepository.find({
      where: { workspaceId },
      take: 10,
    });

    return {
      success: true,
      type: 'deals',
      results: deals,
      count: deals.length,
    };
  }

  private async getStats(params: any, workspaceId: string): Promise<any> {
    const [totalContacts, totalDeals] = await Promise.all([
      this.contactRepository.count({ where: { workspaceId } }),
      this.dealRepository.count({ where: { workspaceId } }),
    ]);

    return {
      success: true,
      type: 'stats',
      data: {
        totalContacts,
        totalDeals,
      },
    };
  }

  private getRuleBasedChatResponse(message: string, workspaceId: string): any {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('help')) {
      return {
        response: 'I can help you manage your CRM. Try asking about your leads, contacts, deals, or tasks.',
        type: 'help',
      };
    }

    if (lowerMessage.includes('thank')) {
      return {
        response: 'You\'re welcome! Let me know if you need anything else.',
        type: 'acknowledgment',
      };
    }

    return {
      response: 'I\'m not sure I understand. Try asking about your leads, contacts, or deals.',
      type: 'fallback',
      suggestions: [
        'Show my hot leads',
        'What tasks are due today?',
        'Find contacts from Acme Corp',
      ],
    };
  }

  private calculateDealHealthScore(deal: any): number {
    let score = 50; // Base score

    // Activity engagement
    if (deal.activities && deal.activities.length > 5) score += 20;
    else if (deal.activities && deal.activities.length > 0) score += 10;

    // Deal age (negative factor)
    const daysSinceCreated = Math.floor((Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCreated < 7) score += 10;
    else if (daysSinceCreated > 30) score -= 20;

    // Stage progression
    if (deal.stage === 'proposal' || deal.stage === 'negotiation') score += 15;

    return Math.max(0, Math.min(100, score));
  }

  private async callOpenAI(contact: Contact): Promise<Partial<Contact>> {
    // Placeholder for OpenAI integration
    // This would make API calls to OpenAI to enrich contact data
    // For now, return empty object
    return {};
  }
}
