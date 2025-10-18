import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, In, Not } from 'typeorm';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
  ) {}

  /**
   * Find all deals with filtering and pagination
   */
  async findAll(workspaceId: string, query: QueryDealsDto) {
    const {
      page = 1,
      limit = 20,
      search,
      stage,
      priority,
      source,
      ownerId,
      contactId,
      companyId,
      tag,
      minValue,
      maxValue,
      closeDateFrom,
      closeDateTo,
      overdue,
      openOnly,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.owner', 'owner')
      .leftJoinAndSelect('deal.contact', 'contact')
      .leftJoinAndSelect('deal.company', 'company')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL');

    // Search
    if (search) {
      queryBuilder.andWhere(
        '(deal.title ILIKE :search OR deal.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Filters
    if (stage) {
      queryBuilder.andWhere('deal.stage = :stage', { stage });
    }

    if (priority) {
      queryBuilder.andWhere('deal.priority = :priority', { priority });
    }

    if (source) {
      queryBuilder.andWhere('deal.source = :source', { source });
    }

    if (ownerId) {
      queryBuilder.andWhere('deal.ownerId = :ownerId', { ownerId });
    }

    if (contactId) {
      queryBuilder.andWhere('deal.contactId = :contactId', { contactId });
    }

    if (companyId) {
      queryBuilder.andWhere('deal.companyId = :companyId', { companyId });
    }

    if (tag) {
      queryBuilder.andWhere(':tag = ANY(deal.tags)', { tag });
    }

    if (minValue !== undefined) {
      queryBuilder.andWhere('deal.value >= :minValue', { minValue });
    }

    if (maxValue !== undefined) {
      queryBuilder.andWhere('deal.value <= :maxValue', { maxValue });
    }

    if (closeDateFrom) {
      queryBuilder.andWhere('deal.expectedCloseDate >= :closeDateFrom', {
        closeDateFrom,
      });
    }

    if (closeDateTo) {
      queryBuilder.andWhere('deal.expectedCloseDate <= :closeDateTo', {
        closeDateTo,
      });
    }

    if (overdue) {
      queryBuilder
        .andWhere('deal.expectedCloseDate < :today', { today: new Date() })
        .andWhere('deal.stage NOT IN (:...closedStages)', {
          closedStages: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
        });
    }

    if (openOnly) {
      queryBuilder.andWhere('deal.stage NOT IN (:...closedStages)', {
        closedStages: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
      });
    }

    // Sorting
    const allowedSortFields = ['createdAt', 'updatedAt', 'value', 'expectedCloseDate', 'title', 'probability'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`deal.${finalSortBy}`, sortOrder);

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [deals, total] = await queryBuilder.getManyAndCount();

    return {
      data: deals,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one deal by ID
   */
  async findOne(workspaceId: string, id: string, relations: string[] = []) {
    const queryBuilder = this.dealRepository
      .createQueryBuilder('deal')
      .where('deal.id = :id', { id })
      .andWhere('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL');

    // Add relations dynamically
    const validRelations = ['owner', 'contact', 'company', 'tasks', 'activities'];
    relations.forEach((relation) => {
      if (validRelations.includes(relation)) {
        queryBuilder.leftJoinAndSelect(`deal.${relation}`, relation);
      }
    });

    const deal = await queryBuilder.getOne();

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }

    return deal;
  }

  /**
   * Create new deal
   */
  async create(workspaceId: string, createDealDto: CreateDealDto) {
    try {
      const deal = this.dealRepository.create({
        ...createDealDto,
        workspaceId,
      });

      const savedDeal = await this.dealRepository.save(deal);

      this.logger.log(`Deal created: ${savedDeal.id} in workspace ${workspaceId}`);

      return this.findOne(workspaceId, savedDeal.id, ['owner', 'contact', 'company']);
    } catch (error) {
      this.logger.error(`Error creating deal: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create deal');
    }
  }

  /**
   * Update deal
   */
  async update(workspaceId: string, id: string, updateDealDto: UpdateDealDto) {
    const deal = await this.findOne(workspaceId, id);

    try {
      Object.assign(deal, updateDealDto);
      await this.dealRepository.save(deal);

      this.logger.log(`Deal updated: ${id} in workspace ${workspaceId}`);

      return this.findOne(workspaceId, id, ['owner', 'contact', 'company']);
    } catch (error) {
      this.logger.error(`Error updating deal: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to update deal');
    }
  }

  /**
   * Delete deal (soft delete)
   */
  async remove(workspaceId: string, id: string) {
    const deal = await this.findOne(workspaceId, id);

    await this.dealRepository.softDelete(id);

    this.logger.log(`Deal deleted: ${id} in workspace ${workspaceId}`);

    return { message: 'Deal deleted successfully' };
  }

  /**
   * Update deal stage
   */
  async updateStage(workspaceId: string, id: string, stage: DealStage) {
    const deal = await this.findOne(workspaceId, id);

    deal.stage = stage;
    deal.lastActivityAt = new Date();

    // Auto-set close date if deal is being closed
    if ([DealStage.CLOSED_WON, DealStage.CLOSED_LOST].includes(stage)) {
      deal.actualCloseDate = new Date();
    }

    await this.dealRepository.save(deal);

    this.logger.log(`Deal ${id} moved to stage: ${stage}`);

    return this.findOne(workspaceId, id, ['owner', 'contact', 'company']);
  }

  /**
   * Get deal pipeline view
   */
  async getPipeline(workspaceId: string) {
    const stages = Object.values(DealStage);

    const pipelineData = await Promise.all(
      stages.map(async (stage) => {
        const deals = await this.dealRepository.find({
          where: {
            workspaceId,
            stage,
            deletedAt: null,
          },
          relations: ['owner', 'contact', 'company'],
          order: { value: 'DESC' },
        });

        const totalValue = deals.reduce((sum, deal) => sum + Number(deal.value), 0);
        const weightedValue = deals.reduce((sum, deal) => sum + deal.weightedValue, 0);

        return {
          stage,
          count: deals.length,
          totalValue,
          weightedValue,
          deals: deals.map((deal) => ({
            id: deal.id,
            title: deal.title,
            value: deal.value,
            probability: deal.probability,
            weightedValue: deal.weightedValue,
            expectedCloseDate: deal.expectedCloseDate,
            owner: deal.owner
              ? { id: deal.owner.id, name: `${deal.owner.firstName} ${deal.owner.lastName}` }
              : null,
            contact: deal.contact
              ? { id: deal.contact.id, name: `${deal.contact.firstName} ${deal.contact.lastName}` }
              : null,
            company: deal.company ? { id: deal.company.id, name: deal.company.name } : null,
            healthScore: deal.getHealthScore(),
            isOverdue: deal.isOverdue,
          })),
        };
      }),
    );

    return {
      pipeline: pipelineData,
      summary: {
        totalDeals: pipelineData.reduce((sum, stage) => sum + stage.count, 0),
        totalValue: pipelineData.reduce((sum, stage) => sum + stage.totalValue, 0),
        totalWeightedValue: pipelineData.reduce((sum, stage) => sum + stage.weightedValue, 0),
      },
    };
  }

  /**
   * Get deals forecast
   */
  async getForecast(workspaceId: string, months: number = 6) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const deals = await this.dealRepository.find({
      where: {
        workspaceId,
        stage: Not(In([DealStage.CLOSED_LOST])),
        expectedCloseDate: Between(startDate, endDate),
        deletedAt: null,
      },
      relations: ['owner'],
      order: { expectedCloseDate: 'ASC' },
    });

    // Group by month
    const forecastByMonth = deals.reduce((acc, deal) => {
      const month = deal.expectedCloseDate
        ? new Date(deal.expectedCloseDate).toISOString().substring(0, 7)
        : 'Unknown';

      if (!acc[month]) {
        acc[month] = {
          month,
          count: 0,
          totalValue: 0,
          weightedValue: 0,
          deals: [],
        };
      }

      acc[month].count += 1;
      acc[month].totalValue += Number(deal.value);
      acc[month].weightedValue += deal.weightedValue;
      acc[month].deals.push({
        id: deal.id,
        title: deal.title,
        value: deal.value,
        probability: deal.probability,
        stage: deal.stage,
      });

      return acc;
    }, {});

    return {
      forecast: Object.values(forecastByMonth),
      summary: {
        totalDeals: deals.length,
        totalValue: deals.reduce((sum, deal) => sum + Number(deal.value), 0),
        weightedValue: deals.reduce((sum, deal) => sum + deal.weightedValue, 0),
      },
    };
  }

  /**
   * Get deal statistics
   */
  async getStats(workspaceId: string) {
    const [
      totalDeals,
      openDeals,
      closedWonDeals,
      closedLostDeals,
      overdueDeals,
    ] = await Promise.all([
      this.dealRepository.count({ where: { workspaceId, deletedAt: null } }),
      this.dealRepository.count({
        where: {
          workspaceId,
          stage: Not(In([DealStage.CLOSED_WON, DealStage.CLOSED_LOST])),
          deletedAt: null,
        },
      }),
      this.dealRepository.count({
        where: { workspaceId, stage: DealStage.CLOSED_WON, deletedAt: null },
      }),
      this.dealRepository.count({
        where: { workspaceId, stage: DealStage.CLOSED_LOST, deletedAt: null },
      }),
      this.dealRepository.count({
        where: {
          workspaceId,
          expectedCloseDate: LessThan(new Date()),
          stage: Not(In([DealStage.CLOSED_WON, DealStage.CLOSED_LOST])),
          deletedAt: null,
        },
      }),
    ]);

    // Calculate total values
    const allDeals = await this.dealRepository.find({
      where: { workspaceId, deletedAt: null },
      select: ['value', 'probability', 'stage'],
    });

    const totalValue = allDeals.reduce((sum, deal) => sum + Number(deal.value), 0);
    const weightedValue = allDeals.reduce((sum, deal) => sum + deal.weightedValue, 0);
    const avgDealValue = totalDeals > 0 ? totalValue / totalDeals : 0;
    const winRate =
      closedWonDeals + closedLostDeals > 0
        ? (closedWonDeals / (closedWonDeals + closedLostDeals)) * 100
        : 0;

    return {
      totalDeals,
      openDeals,
      closedWonDeals,
      closedLostDeals,
      overdueDeals,
      totalValue,
      weightedValue,
      avgDealValue,
      winRate: Math.round(winRate * 10) / 10,
    };
  }

  /**
   * Bulk delete deals
   */
  async bulkDelete(workspaceId: string, ids: string[]) {
    // Verify all deals belong to workspace
    const deals = await this.dealRepository.find({
      where: { id: In(ids), workspaceId, deletedAt: null },
    });

    if (deals.length !== ids.length) {
      throw new BadRequestException('Some deals not found or not accessible');
    }

    await this.dealRepository.softDelete(ids);

    this.logger.log(`Bulk deleted ${ids.length} deals in workspace ${workspaceId}`);

    return { deleted: ids.length };
  }

  /**
   * Bulk update deal stage
   */
  async bulkUpdateStage(workspaceId: string, ids: string[], stage: DealStage) {
    // Verify all deals belong to workspace
    const deals = await this.dealRepository.find({
      where: { id: In(ids), workspaceId, deletedAt: null },
    });

    if (deals.length !== ids.length) {
      throw new BadRequestException('Some deals not found or not accessible');
    }

    await this.dealRepository.update({ id: In(ids) }, { stage, lastActivityAt: new Date() });

    this.logger.log(`Bulk updated ${ids.length} deals to stage ${stage} in workspace ${workspaceId}`);

    return { updated: ids.length };
  }

  /**
   * Move deal to different stage
   */
  async moveToStage(workspaceId: string, id: string, stage: DealStage) {
    const deal = await this.findOne(workspaceId, id);

    const previousStage = deal.stage;
    deal.stage = stage;
    deal.lastActivityAt = new Date();

    // Auto-update probability based on stage
    switch (stage) {
      case DealStage.LEAD:
        deal.probability = 10;
        break;
      case DealStage.QUALIFIED:
        deal.probability = 25;
        break;
      case DealStage.PROPOSAL:
        deal.probability = 50;
        break;
      case DealStage.NEGOTIATION:
        deal.probability = 75;
        break;
      case DealStage.CLOSED_WON:
        deal.probability = 100;
        deal.closedDate = new Date();
        break;
      case DealStage.CLOSED_LOST:
        deal.probability = 0;
        deal.closedDate = new Date();
        break;
    }

    await this.dealRepository.save(deal);

    this.logger.log(`Deal ${id} moved from ${previousStage} to ${stage}`);

    return deal;
  }

  /**
   * Get deal velocity metrics (average time in each stage)
   */
  async getVelocityMetrics(workspaceId: string) {
    const deals = await this.dealRepository.find({
      where: { workspaceId, deletedAt: null },
      select: ['id', 'stage', 'createdAt', 'lastActivityAt', 'closedDate'],
    });

    // Calculate average time in each stage
    const stageMetrics = Object.values(DealStage).map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage);

      if (stageDeals.length === 0) {
        return {
          stage,
          count: 0,
          avgDaysInStage: 0,
        };
      }

      const totalDays = stageDeals.reduce((sum, deal) => {
        const startDate = deal.createdAt;
        const endDate = deal.closedDate || deal.lastActivityAt || new Date();
        const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);

      return {
        stage,
        count: stageDeals.length,
        avgDaysInStage: Math.round(totalDays / stageDeals.length),
      };
    });

    // Calculate overall sales cycle length
    const closedDeals = deals.filter(
      (d) => d.stage === DealStage.CLOSED_WON || d.stage === DealStage.CLOSED_LOST,
    );

    let avgSalesCycle = 0;
    if (closedDeals.length > 0) {
      const totalCycleDays = closedDeals.reduce((sum, deal) => {
        if (deal.closedDate) {
          const days = Math.floor(
            (deal.closedDate.getTime() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24),
          );
          return sum + days;
        }
        return sum;
      }, 0);

      avgSalesCycle = Math.round(totalCycleDays / closedDeals.length);
    }

    return {
      stageMetrics,
      avgSalesCycle,
      totalDealsAnalyzed: deals.length,
    };
  }

  /**
   * Get conversion rates between stages
   */
  async getConversionRates(workspaceId: string) {
    const deals = await this.dealRepository.find({
      where: { workspaceId, deletedAt: null },
      select: ['stage'],
    });

    const stageCounts = Object.values(DealStage).reduce((acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage).length;
      return acc;
    }, {} as Record<DealStage, number>);

    // Calculate conversion rates (simplified - assumes linear progression)
    const stages = [
      DealStage.LEAD,
      DealStage.QUALIFIED,
      DealStage.PROPOSAL,
      DealStage.NEGOTIATION,
      DealStage.CLOSED_WON,
    ];

    const conversionRates = stages.map((stage, index) => {
      if (index === 0) {
        return {
          fromStage: null,
          toStage: stage,
          count: stageCounts[stage],
          conversionRate: 100,
        };
      }

      const previousStage = stages[index - 1];
      const previousCount = stageCounts[previousStage];
      const currentCount = stageCounts[stage];

      const conversionRate = previousCount > 0 ? (currentCount / previousCount) * 100 : 0;

      return {
        fromStage: previousStage,
        toStage: stage,
        count: currentCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
      };
    });

    // Overall win rate
    const totalAttempted = stageCounts[DealStage.CLOSED_WON] + stageCounts[DealStage.CLOSED_LOST];
    const winRate =
      totalAttempted > 0 ? (stageCounts[DealStage.CLOSED_WON] / totalAttempted) * 100 : 0;

    return {
      conversionRates,
      winRate: Math.round(winRate * 10) / 10,
      lossRate: Math.round((100 - winRate) * 10) / 10,
      totalDeals: deals.length,
    };
  }

  /**
   * Get stage analytics with detailed metrics
   */
  async getStageAnalytics(workspaceId: string) {
    const pipeline = await this.getPipeline(workspaceId);
    const velocity = await this.getVelocityMetrics(workspaceId);
    const conversion = await this.getConversionRates(workspaceId);

    return {
      pipeline: pipeline.pipeline,
      summary: pipeline.summary,
      velocity: velocity.stageMetrics,
      avgSalesCycle: velocity.avgSalesCycle,
      conversionRates: conversion.conversionRates,
      winRate: conversion.winRate,
    };
  }
}