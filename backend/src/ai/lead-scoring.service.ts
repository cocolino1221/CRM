import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from '../database/entities/contact.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { Activity } from '../database/entities/activity.entity';

export interface LeadScore {
  score: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    name: string;
    value: number;
    weight: number;
    contribution: number;
  }[];
  recommendations: string[];
  predictedConversionRate: number;
}

export interface ScoringWeights {
  demographics: number;
  engagement: number;
  behavioral: number;
  firmographics: number;
  timing: number;
}

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  // ML-inspired weights (would be learned from historical data in production)
  private readonly defaultWeights: ScoringWeights = {
    demographics: 0.25,  // Contact info completeness
    engagement: 0.30,     // Activity level
    behavioral: 0.20,     // Actions taken
    firmographics: 0.15,  // Company info
    timing: 0.10,         // Recency factors
  };

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  /**
   * Calculate comprehensive lead score using ML-inspired model
   */
  async scoreContact(contactId: string, workspaceId: string): Promise<LeadScore> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId },
      relations: ['deals', 'activities', 'tasks'],
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    // Calculate individual factor scores
    const demographicsScore = this.calculateDemographicsScore(contact);
    const engagementScore = await this.calculateEngagementScore(contact);
    const behavioralScore = this.calculateBehavioralScore(contact);
    const firmographicsScore = this.calculateFirmographicsScore(contact);
    const timingScore = this.calculateTimingScore(contact);

    // Weighted sum
    const rawScore =
      demographicsScore * this.defaultWeights.demographics +
      engagementScore * this.defaultWeights.engagement +
      behavioralScore * this.defaultWeights.behavioral +
      firmographicsScore * this.defaultWeights.firmographics +
      timingScore * this.defaultWeights.timing;

    const normalizedScore = Math.round(rawScore);

    // Calculate grade
    const grade = this.scoreToGrade(normalizedScore);

    // Build factor breakdown
    const factors = [
      {
        name: 'Demographics',
        value: demographicsScore,
        weight: this.defaultWeights.demographics,
        contribution: demographicsScore * this.defaultWeights.demographics,
      },
      {
        name: 'Engagement',
        value: engagementScore,
        weight: this.defaultWeights.engagement,
        contribution: engagementScore * this.defaultWeights.engagement,
      },
      {
        name: 'Behavioral',
        value: behavioralScore,
        weight: this.defaultWeights.behavioral,
        contribution: behavioralScore * this.defaultWeights.behavioral,
      },
      {
        name: 'Firmographics',
        value: firmographicsScore,
        weight: this.defaultWeights.firmographics,
        contribution: firmographicsScore * this.defaultWeights.firmographics,
      },
      {
        name: 'Timing',
        value: timingScore,
        weight: this.defaultWeights.timing,
        contribution: timingScore * this.defaultWeights.timing,
      },
    ];

    // Generate recommendations
    const recommendations = this.generateRecommendations(contact, factors);

    // Predict conversion rate (simplified logistic function)
    const predictedConversionRate = this.predictConversionRate(normalizedScore);

    this.logger.log(`Scored contact ${contact.email}: ${normalizedScore} (${grade})`);

    return {
      score: normalizedScore,
      grade,
      factors,
      recommendations,
      predictedConversionRate,
    };
  }

  /**
   * Batch score multiple contacts
   */
  async batchScoreContacts(workspaceId: string, contactIds?: string[]): Promise<Map<string, LeadScore>> {
    let contacts: Contact[];

    if (contactIds && contactIds.length > 0) {
      contacts = await this.contactRepository.findByIds(contactIds);
    } else {
      contacts = await this.contactRepository.find({
        where: { workspaceId },
        relations: ['deals', 'activities'],
      });
    }

    const scores = new Map<string, LeadScore>();

    for (const contact of contacts) {
      try {
        const score = await this.scoreContact(contact.id, workspaceId);
        scores.set(contact.id, score);
      } catch (error) {
        this.logger.error(`Failed to score contact ${contact.id}: ${error.message}`);
      }
    }

    this.logger.log(`Batch scored ${scores.size} contacts`);
    return scores;
  }

  /**
   * Get score distribution for workspace (for analytics)
   */
  async getScoreDistribution(workspaceId: string): Promise<{
    gradeA: number;
    gradeB: number;
    gradeC: number;
    gradeD: number;
    gradeF: number;
    total: number;
    avgScore: number;
  }> {
    const contacts = await this.contactRepository.find({
      where: { workspaceId },
      relations: ['deals', 'activities'],
    });

    const scores = await Promise.all(
      contacts.map(c => this.scoreContact(c.id, workspaceId))
    );

    const distribution = {
      gradeA: scores.filter(s => s.grade.startsWith('A')).length,
      gradeB: scores.filter(s => s.grade === 'B').length,
      gradeC: scores.filter(s => s.grade === 'C').length,
      gradeD: scores.filter(s => s.grade === 'D').length,
      gradeF: scores.filter(s => s.grade === 'F').length,
      total: scores.length,
      avgScore: scores.reduce((sum, s) => sum + s.score, 0) / scores.length,
    };

    return distribution;
  }

  // Scoring factor calculations

  private calculateDemographicsScore(contact: Contact): number {
    let score = 0;

    // Contact info completeness
    if (contact.email) score += 20;
    if (contact.phone) score += 15;
    if (contact.firstName && contact.lastName) score += 10;
    if (contact.jobTitle) score += 15;
    if (contact.customFields?.linkedinUrl) score += 10;

    // Custom fields
    if (contact.customFields) {
      const fieldCount = Object.keys(contact.customFields).length;
      score += Math.min(fieldCount * 5, 30);
    }

    return Math.min(score, 100);
  }

  private async calculateEngagementScore(contact: Contact): Promise<number> {
    let score = 0;

    // Activity count and recency
    if (contact.activities) {
      const activityCount = contact.activities.length;
      score += Math.min(activityCount * 5, 40);

      // Recent activity bonus
      const recentActivities = contact.activities.filter(a => {
        const daysSince = (Date.now() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      });
      score += Math.min(recentActivities.length * 10, 30);
    }

    // Deal engagement
    if (contact.deals) {
      const activeDeals = contact.deals.filter(
        d => d.stage !== DealStage.CLOSED_WON && d.stage !== DealStage.CLOSED_LOST
      );
      score += Math.min(activeDeals.length * 15, 30);
    }

    return Math.min(score, 100);
  }

  private calculateBehavioralScore(contact: Contact): number {
    let score = 0;

    // Has deals (shows purchase intent)
    if (contact.deals && contact.deals.length > 0) {
      score += 30;

      // Won deals (strong positive signal)
      const wonDeals = contact.deals.filter(d => d.stage === DealStage.CLOSED_WON);
      score += wonDeals.length * 20;

      // Deal stages
      const advancedDeals = contact.deals.filter(
        d => d.stage === 'proposal' || d.stage === 'negotiation'
      );
      score += advancedDeals.length * 15;
    }

    // Tags indicate interest areas
    if (contact.tags && contact.tags.length > 0) {
      score += Math.min(contact.tags.length * 5, 20);
    }

    // Has tasks (shows active management)
    if (contact.tasks && contact.tasks.length > 0) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  private calculateFirmographicsScore(contact: Contact): number {
    let score = 0;

    // Company information
    if (contact.company) score += 25;

    // Custom fields that indicate company size/budget
    if (contact.customFields) {
      if (contact.customFields.companySize) {
        const size = contact.customFields.companySize.toLowerCase();
        if (size.includes('enterprise') || size.includes('large')) score += 25;
        else if (size.includes('medium')) score += 15;
        else score += 10;
      }

      if (contact.customFields.budget) {
        const budget = parseFloat(contact.customFields.budget);
        if (!isNaN(budget)) {
          if (budget > 100000) score += 30;
          else if (budget > 50000) score += 20;
          else if (budget > 10000) score += 10;
          else score += 5;
        }
      }

      if (contact.customFields.industry) score += 10;
      if (contact.customFields.website) score += 10;
    }

    return Math.min(score, 100);
  }

  private calculateTimingScore(contact: Contact): number {
    let score = 50; // Start at neutral

    // Recency of contact creation
    const daysSinceCreated = (Date.now() - contact.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreated <= 7) score += 30; // Very recent
    else if (daysSinceCreated <= 30) score += 15; // Recent
    else if (daysSinceCreated <= 90) score += 0; // Neutral
    else score -= 20; // Old lead, losing warmth

    // Check for timeline indicators in custom fields
    if (contact.customFields?.timeline) {
      const timeline = contact.customFields.timeline.toLowerCase();
      if (timeline.includes('immediate') || timeline.includes('urgent')) score += 20;
      else if (timeline.includes('month')) score += 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  private scoreToGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 50) return 'C';
    if (score >= 30) return 'D';
    return 'F';
  }

  private generateRecommendations(contact: Contact, factors: any[]): string[] {
    const recommendations: string[] = [];

    // Find weakest factors
    const sortedFactors = [...factors].sort((a, b) => a.contribution - b.contribution);

    sortedFactors.slice(0, 2).forEach(factor => {
      if (factor.name === 'Demographics' && factor.value < 60) {
        recommendations.push('Complete contact profile (add phone, job title, LinkedIn)');
      } else if (factor.name === 'Engagement' && factor.value < 60) {
        recommendations.push('Increase engagement - schedule a call or send personalized email');
      } else if (factor.name === 'Behavioral' && factor.value < 60) {
        recommendations.push('Create a deal to track sales progress');
      } else if (factor.name === 'Firmographics' && factor.value < 60) {
        recommendations.push('Research and add company information (size, industry, budget)');
      } else if (factor.name === 'Timing' && factor.value < 60) {
        recommendations.push('Re-engage this cold lead with new content or offer');
      }
    });

    // Add priority-based recommendations
    const totalScore = factors.reduce((sum, f) => sum + f.contribution, 0);
    if (totalScore >= 80) {
      recommendations.unshift('HIGH PRIORITY: Schedule demo call within 24 hours');
    } else if (totalScore >= 60) {
      recommendations.unshift('MEDIUM PRIORITY: Send follow-up email this week');
    }

    return recommendations;
  }

  private predictConversionRate(score: number): number {
    // Simplified logistic regression model
    // In production, this would be trained on historical conversion data
    // Formula: 1 / (1 + e^(-k(x - x0)))
    // Where k controls steepness and x0 is the midpoint

    const k = 0.08; // Steepness
    const x0 = 50;   // Midpoint (50% score = 50% conversion)

    const rate = 1 / (1 + Math.exp(-k * (score - x0)));
    return Math.round(rate * 100 * 10) / 10; // Round to 1 decimal
  }

  /**
   * Train model on historical data (simplified version)
   * In production, this would use actual ML algorithms
   */
  async trainModel(workspaceId: string): Promise<{
    samplesAnalyzed: number;
    conversionRate: number;
    optimalWeights: ScoringWeights;
  }> {
    this.logger.log(`Training lead scoring model for workspace ${workspaceId}`);

    // Get all contacts with won deals (positive examples)
    const wonContacts = await this.contactRepository
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.deals', 'deal')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.stage = :stage', { stage: DealStage.CLOSED_WON })
      .getMany();

    // Get all contacts with lost deals (negative examples)
    const lostContacts = await this.contactRepository
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.deals', 'deal')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.stage = :stage', { stage: DealStage.CLOSED_LOST })
      .getMany();

    const totalSamples = wonContacts.length + lostContacts.length;
    const conversionRate = totalSamples > 0
      ? (wonContacts.length / totalSamples) * 100
      : 0;

    // In a real ML implementation, we would:
    // 1. Extract features for each contact
    // 2. Use gradient descent or other optimization
    // 3. Find optimal weights that maximize prediction accuracy
    // For now, return default weights

    this.logger.log(`Model trained on ${totalSamples} samples (${wonContacts.length} won, ${lostContacts.length} lost)`);

    return {
      samplesAnalyzed: totalSamples,
      conversionRate: Math.round(conversionRate * 10) / 10,
      optimalWeights: this.defaultWeights,
    };
  }
}
