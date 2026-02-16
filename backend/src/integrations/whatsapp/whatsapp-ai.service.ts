import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../../database/entities/activity.entity';
import { Contact } from '../../database/entities/contact.entity';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';
import Anthropic from '@anthropic-ai/sdk';

export interface AIReplyConfig {
  enabled: boolean;
  systemPrompt: string;
  maxTokens: number;
  respondWithin24hOnly: boolean;
  fallbackToKeywords: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer service assistant. Answer customer questions concisely and professionally. Keep replies under 3 sentences unless the customer asks for details. Use a friendly, professional tone. If you don't know something, say so honestly and offer to connect them with a human agent.`;

@Injectable()
export class WhatsAppAIService {
  private readonly logger = new Logger(WhatsAppAIService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Anthropic API client initialized');
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI auto-replies disabled');
    }
  }

  async getConfig(workspaceId: string): Promise<AIReplyConfig> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return integration?.config?.aiAutoReply || {
      enabled: false,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxTokens: 300,
      respondWithin24hOnly: true,
      fallbackToKeywords: true,
    };
  }

  async saveConfig(workspaceId: string, config: Partial<AIReplyConfig>): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) return;
    integration.config = {
      ...(integration.config || {}),
      aiAutoReply: {
        ...((integration.config?.aiAutoReply) || {}),
        ...config,
      },
    };
    await this.integrationRepository.save(integration);
    this.logger.log(`AI auto-reply config updated for workspace ${workspaceId}`);
  }

  /**
   * Generate an AI reply for an inbound WhatsApp message.
   * Returns null if AI is disabled, no API key, or an error occurs.
   */
  async generateReply(
    workspaceId: string,
    contactPhone: string,
    inboundMessage: string,
    senderName: string,
  ): Promise<string | null> {
    if (!this.client) {
      this.logger.log('AI reply skipped: no Anthropic client');
      return null;
    }

    const config = await this.getConfig(workspaceId);
    if (!config.enabled) return null;

    try {
      // Get recent message history for context (last 10 messages)
      const recentActivities = await this.activityRepository.find({
        where: { workspaceId },
        order: { createdAt: 'DESC' },
        take: 10,
      });

      // Filter to this phone's messages
      const phoneMessages = recentActivities
        .filter(a => a.metadata?.waId === contactPhone.replace(/\D/g, '') || a.title?.includes(contactPhone))
        .reverse()
        .map(a => ({
          role: a.direction === 'inbound' ? 'user' as const : 'assistant' as const,
          content: a.description || '',
        }));

      // Get contact info for context
      const contact = await this.contactRepository.findOne({
        where: { workspaceId, phone: contactPhone },
        relations: ['company'],
      });

      // Build system prompt with contact context
      let systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      if (contact) {
        systemPrompt += `\n\nCustomer info:\n- Name: ${contact.firstName} ${contact.lastName}\n- Status: ${contact.status}`;
        if (contact.company) systemPrompt += `\n- Company: ${contact.company.name}`;
        if (contact.tags?.length) systemPrompt += `\n- Tags: ${contact.tags.join(', ')}`;
      }

      // Build message array
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      // Add recent history (skip empty messages)
      for (const msg of phoneMessages) {
        if (msg.content.trim()) messages.push(msg);
      }
      // Add current inbound message
      messages.push({ role: 'user', content: inboundMessage });

      this.logger.log(`AI generating reply for ${senderName} (${contactPhone}), ${messages.length} messages in context`);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: config.maxTokens || 300,
        system: systemPrompt,
        messages,
      });

      const reply = response.content[0]?.type === 'text' ? response.content[0].text : null;
      if (reply) {
        this.logger.log(`AI reply generated: "${reply.substring(0, 100)}..."`);
      }
      return reply;
    } catch (err) {
      this.logger.error(`AI reply generation failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Test AI reply generation with a sample message (for frontend testing)
   */
  async testReply(workspaceId: string, testMessage: string): Promise<{ reply: string | null; error?: string }> {
    if (!this.client) return { reply: null, error: 'Anthropic API key not configured' };

    const config = await this.getConfig(workspaceId);
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: config.maxTokens || 300,
        system: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: testMessage }],
      });
      const reply = response.content[0]?.type === 'text' ? response.content[0].text : null;
      return { reply };
    } catch (err) {
      return { reply: null, error: err.message };
    }
  }
}
