import { Controller, Post, Get, Param, UseGuards, Req, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { AIAgentService, LeadAnalysis } from './ai-agent.service';
import { LeadScoringService } from './lead-scoring.service';

@ApiTags('AI Agent')
@Controller('ai')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class AIController {
  constructor(
    private readonly aiAgentService: AIAgentService,
    private readonly leadScoringService: LeadScoringService,
  ) {}

  @Post('leads/:contactId/analyze')
  @ApiOperation({ summary: 'Analyze lead and provide qualification score' })
  @ApiResponse({ status: 200, description: 'Lead analysis completed' })
  async analyzeLead(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadAnalysis> {
    return this.aiAgentService.analyzeLead(contactId, req.user.workspaceId);
  }

  @Post('leads/:contactId/create-tasks')
  @ApiOperation({ summary: 'Auto-create tasks for a lead based on qualification' })
  @ApiResponse({ status: 200, description: 'Tasks created successfully' })
  async createLeadTasks(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.createLeadTasks(
      contactId,
      req.user.workspaceId,
      req.user.id,
    );
  }

  @Post('leads/:contactId/send-email')
  @ApiOperation({ summary: 'Send automated email based on lead qualification' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendQualificationEmail(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.aiAgentService.sendQualificationEmail(contactId, req.user.workspaceId);
    return { success: true, message: 'Email sent successfully' };
  }

  @Post('leads/:contactId/enrich')
  @ApiOperation({ summary: 'Enrich contact data using AI' })
  @ApiResponse({ status: 200, description: 'Contact enriched successfully' })
  async enrichContact(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.enrichContact(contactId, req.user.workspaceId);
  }

  @Post('leads/:contactId/process')
  @ApiOperation({ summary: 'Process new lead: analyze, create tasks, and send email' })
  @ApiResponse({ status: 200, description: 'Lead processed successfully' })
  async processNewLead(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ analysis: LeadAnalysis; tasks: any[]; emailSent: boolean }> {
    return this.aiAgentService.processNewLead(
      contactId,
      req.user.workspaceId,
      req.user.id,
    );
  }

  @Post('query')
  @ApiOperation({ summary: 'Natural language query to search CRM data' })
  @ApiResponse({ status: 200, description: 'Query results returned' })
  async naturalLanguageQuery(
    @Body() body: { query: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.processNaturalLanguageQuery(
      body.query,
      req.user.workspaceId,
    );
  }

  @Post('chat')
  @ApiOperation({ summary: 'AI chat assistant for CRM help' })
  @ApiResponse({ status: 200, description: 'Chat response generated' })
  async chat(
    @Body() body: { message: string; conversationHistory?: any[] },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.chat(
      body.message,
      req.user.workspaceId,
      body.conversationHistory,
    );
  }

  @Post('sentiment')
  @ApiOperation({ summary: 'Analyze sentiment from text (email, note, etc.)' })
  @ApiResponse({ status: 200, description: 'Sentiment analysis completed' })
  async analyzeSentiment(
    @Body() body: { text: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.analyzeSentiment(body.text);
  }

  @Get('deals/:dealId/recommendations')
  @ApiOperation({ summary: 'Get AI recommendations for deal' })
  @ApiResponse({ status: 200, description: 'Recommendations generated' })
  async getDealRecommendations(
    @Param('dealId') dealId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.getDealRecommendations(
      dealId,
      req.user.workspaceId,
    );
  }

  @Post('generate-email')
  @ApiOperation({ summary: 'Generate email content using AI' })
  @ApiResponse({ status: 200, description: 'Email content generated' })
  async generateEmail(
    @Body() body: { context: string; tone?: string; purpose?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiAgentService.generateEmail(
      body.context,
      body.tone,
      body.purpose,
    );
  }

  @Post('lead-score/:contactId')
  @ApiOperation({ summary: 'Calculate ML-based lead score for contact' })
  @ApiResponse({ status: 200, description: 'Lead score calculated' })
  async scoreContact(
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadScoringService.scoreContact(contactId, req.user.workspaceId);
  }

  @Post('lead-score/batch')
  @ApiOperation({ summary: 'Batch score multiple contacts' })
  @ApiResponse({ status: 200, description: 'Contacts scored' })
  async batchScoreContacts(
    @Body() body: { contactIds?: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const scores = await this.leadScoringService.batchScoreContacts(
      req.user.workspaceId,
      body.contactIds,
    );
    return Object.fromEntries(scores);
  }

  @Get('lead-score/distribution')
  @ApiOperation({ summary: 'Get lead score distribution for workspace' })
  @ApiResponse({ status: 200, description: 'Score distribution returned' })
  async getScoreDistribution(@Req() req: AuthenticatedRequest) {
    return this.leadScoringService.getScoreDistribution(req.user.workspaceId);
  }

  @Post('lead-score/train')
  @ApiOperation({ summary: 'Train lead scoring model on historical data' })
  @ApiResponse({ status: 200, description: 'Model trained successfully' })
  async trainScoringModel(@Req() req: AuthenticatedRequest) {
    return this.leadScoringService.trainModel(req.user.workspaceId);
  }
}
