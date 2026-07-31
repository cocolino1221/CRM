import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { AIAgentService } from '../../ai/ai-agent.service';
import { LeadScoringService } from '../../ai/lead-scoring.service';

@Processor(QUEUE_NAMES.BACKGROUND_JOBS)
export class AIProcessor {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    private readonly aiAgentService: AIAgentService,
    private readonly leadScoringService: LeadScoringService,
  ) {}

  @Process(JOB_TYPES.AI_LEAD_SCORE)
  async handleLeadScore(job: Job<{
    contactId: string;
    workspaceId: string;
  }>) {
    this.logger.log(`Processing AI lead score job ${job.id} for contact ${job.data.contactId}`);

    try {
      const score = await this.leadScoringService.scoreContact(
        job.data.contactId,
        job.data.workspaceId,
      );

      this.logger.log(`Lead score calculated: ${score.score} (${score.grade})`);

      return {
        success: true,
        contactId: job.data.contactId,
        score: score.score,
        grade: score.grade,
      };
    } catch (error) {
      this.logger.error(`Failed to score lead: ${error.message}`);
      throw error;
    }
  }

  @Process(JOB_TYPES.AI_ENRICH_CONTACT)
  async handleEnrichContact(job: Job<{
    contactId: string;
    workspaceId: string;
  }>) {
    this.logger.log(`Processing AI contact enrichment job ${job.id}`);

    try {
      const enrichedContact = await this.aiAgentService.enrichContact(
        job.data.contactId,
        job.data.workspaceId,
      );

      this.logger.log(`Contact ${job.data.contactId} enriched successfully`);

      return {
        success: true,
        contactId: job.data.contactId,
        contact: enrichedContact,
      };
    } catch (error) {
      this.logger.error(`Failed to enrich contact: ${error.message}`);
      throw error;
    }
  }

  @Process(JOB_TYPES.AI_GENERATE_EMAIL)
  async handleGenerateEmail(job: Job<{
    context: string;
    tone?: string;
    purpose?: string;
  }>) {
    this.logger.log(`Processing AI email generation job ${job.id}`);

    try {
      const emailContent = await this.aiAgentService.generateEmail(
        job.data.context,
        job.data.tone,
        job.data.purpose,
      );

      this.logger.log(`Email generated successfully`);

      return {
        success: true,
        email: emailContent,
      };
    } catch (error) {
      this.logger.error(`Failed to generate email: ${error.message}`);
      throw error;
    }
  }

  @Process(JOB_TYPES.AI_SENTIMENT_ANALYSIS)
  async handleSentimentAnalysis(job: Job<{
    text: string;
    entityId: string;
    entityType: 'contact' | 'deal' | 'activity';
  }>) {
    this.logger.log(`Processing AI sentiment analysis job ${job.id}`);

    try {
      const sentiment = await this.aiAgentService.analyzeSentiment(job.data.text);

      this.logger.log(`Sentiment analyzed: ${sentiment.sentiment} (${sentiment.score})`);

      return {
        success: true,
        entityId: job.data.entityId,
        entityType: job.data.entityType,
        sentiment,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze sentiment: ${error.message}`);
      throw error;
    }
  }

  @Process(JOB_TYPES.AI_PROCESS_LEAD)
  async handleProcessLead(job: Job<{
    contactId: string;
    workspaceId: string;
    userId: string;
  }>) {
    this.logger.log(`Processing AI lead processing job ${job.id} for contact ${job.data.contactId}`);

    try {
      const result = await this.aiAgentService.processNewLead(
        job.data.contactId,
        job.data.workspaceId,
        job.data.userId,
      );

      this.logger.log(`Lead processed: Score ${result.analysis.score}, ${result.tasks.length} tasks created`);

      return {
        success: true,
        contactId: job.data.contactId,
        analysis: result.analysis,
        tasksCreated: result.tasks.length,
        emailSent: result.emailSent,
      };
    } catch (error) {
      this.logger.error(`Failed to process lead: ${error.message}`);
      throw error;
    }
  }
}
