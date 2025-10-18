import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, LessThan } from 'typeorm';
import { Contact } from '../database/entities/contact.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { Task } from '../database/entities/task.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { TimeRange } from './dto/date-range.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  async getDashboardOverview(workspaceId: string) {
    this.logger.log(`Getting dashboard overview for workspace ${workspaceId}`);

    const [
      totalContacts,
      totalDeals,
      totalCompanies,
      totalTasks,
      openDeals,
      openTasks,
      dealValue,
    ] = await Promise.all([
      this.contactRepository.count({ where: { workspaceId, deletedAt: null as any } }),
      this.dealRepository.count({ where: { workspaceId, deletedAt: null as any } }),
      this.companyRepository.count({ where: { workspaceId, deletedAt: null as any } }),
      this.taskRepository.count({ where: { workspaceId, deletedAt: null as any } }),
      this.dealRepository
        .createQueryBuilder('deal')
        .where('deal.workspaceId = :workspaceId', { workspaceId })
        .andWhere('deal.deletedAt IS NULL')
        .andWhere('deal.actualCloseDate IS NULL')
        .getCount(),
      this.taskRepository.count({
        where: { workspaceId, deletedAt: null as any, completedAt: null as any },
      }),
      this.dealRepository
        .createQueryBuilder('deal')
        .select('SUM(deal.value)', 'total')
        .where('deal.workspaceId = :workspaceId', { workspaceId })
        .andWhere('deal.deletedAt IS NULL')
        .getRawOne(),
    ]);

    return {
      contacts: { total: totalContacts },
      deals: {
        total: totalDeals,
        open: openDeals,
        closed: totalDeals - openDeals,
        totalValue: dealValue?.total ? parseFloat(dealValue.total) : 0,
      },
      companies: { total: totalCompanies },
      tasks: {
        total: totalTasks,
        open: openTasks,
        completed: totalTasks - openTasks,
      },
    };
  }

  async getSalesMetrics(workspaceId: string, startDate: Date, endDate: Date) {
    this.logger.log(`Getting sales metrics for workspace ${workspaceId}`);

    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL')
      .andWhere('deal.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    const wonDeals = deals.filter(d => d.stage === DealStage.CLOSED_WON);
    const lostDeals = deals.filter(d => d.stage === DealStage.CLOSED_LOST);

    const totalRevenue = wonDeals.reduce((sum, d) => sum + d.value, 0);
    const averageDealSize = wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;
    const winRate = deals.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;

    return {
      totalDeals: deals.length,
      wonDeals: wonDeals.length,
      lostDeals: lostDeals.length,
      openDeals: deals.length - wonDeals.length - lostDeals.length,
      totalRevenue,
      averageDealSize,
      winRate: parseFloat(winRate.toFixed(2)),
    };
  }

  async getContactsMetrics(workspaceId: string, startDate: Date, endDate: Date) {
    this.logger.log(`Getting contacts metrics for workspace ${workspaceId}`);

    const [total, newContacts, byStatus, bySource] = await Promise.all([
      this.contactRepository.count({ where: { workspaceId, deletedAt: null as any } }),
      this.contactRepository.count({
        where: {
          workspaceId,
          deletedAt: null as any,
          createdAt: Between(startDate, endDate),
        },
      }),
      this.contactRepository
        .createQueryBuilder('contact')
        .select('contact.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('contact.workspaceId = :workspaceId', { workspaceId })
        .andWhere('contact.deletedAt IS NULL')
        .groupBy('contact.status')
        .getRawMany(),
      this.contactRepository
        .createQueryBuilder('contact')
        .select('contact.source', 'source')
        .addSelect('COUNT(*)', 'count')
        .where('contact.workspaceId = :workspaceId', { workspaceId })
        .andWhere('contact.deletedAt IS NULL')
        .andWhere('contact.source IS NOT NULL')
        .groupBy('contact.source')
        .getRawMany(),
    ]);

    return {
      total,
      newContacts,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count, 10);
        return acc;
      }, {}),
      bySource: bySource.reduce((acc, item) => {
        acc[item.source] = parseInt(item.count, 10);
        return acc;
      }, {}),
    };
  }

  async getTasksMetrics(workspaceId: string, startDate: Date, endDate: Date) {
    this.logger.log(`Getting tasks metrics for workspace ${workspaceId}`);

    const [total, completed, overdue, byPriority, byStatus] = await Promise.all([
      this.taskRepository.count({
        where: {
          workspaceId,
          deletedAt: null as any,
          createdAt: Between(startDate, endDate),
        },
      }),
      this.taskRepository.count({
        where: {
          workspaceId,
          deletedAt: null as any,
          completedAt: Between(startDate, endDate),
        },
      }),
      this.taskRepository.count({
        where: {
          workspaceId,
          deletedAt: null as any,
          dueDate: LessThan(new Date()),
          completedAt: null as any,
        },
      }),
      this.taskRepository
        .createQueryBuilder('task')
        .select('task.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .where('task.workspaceId = :workspaceId', { workspaceId })
        .andWhere('task.deletedAt IS NULL')
        .groupBy('task.priority')
        .getRawMany(),
      this.taskRepository
        .createQueryBuilder('task')
        .select('task.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('task.workspaceId = :workspaceId', { workspaceId })
        .andWhere('task.deletedAt IS NULL')
        .groupBy('task.status')
        .getRawMany(),
    ]);

    return {
      total,
      completed,
      overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.count, 10);
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count, 10);
        return acc;
      }, {}),
    };
  }

  async getActivityTrend(workspaceId: string, startDate: Date, endDate: Date, groupBy: 'day' | 'week' | 'month' = 'day') {
    this.logger.log(`Getting activity trend for workspace ${workspaceId}`);

    let dateFormat: string;
    switch (groupBy) {
      case 'week':
        dateFormat = 'YYYY-IW'; // ISO week
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const activities = await this.activityRepository
      .createQueryBuilder('activity')
      .select(`TO_CHAR(activity.createdAt, '${dateFormat}')`, 'date')
      .addSelect('activity.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('date')
      .addGroupBy('activity.type')
      .orderBy('date', 'ASC')
      .getRawMany();

    return activities.map(item => ({
      date: item.date,
      type: item.type,
      count: parseInt(item.count, 10),
    }));
  }

  async getRevenueForecast(workspaceId: string, months: number = 3) {
    this.logger.log(`Getting revenue forecast for workspace ${workspaceId}`);

    // Get historical deal data for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalDeals = await this.dealRepository
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL')
      .andWhere('deal.stage = :stage', { stage: DealStage.CLOSED_WON })
      .andWhere('deal.actualCloseDate >= :date', { date: sixMonthsAgo })
      .getMany();

    // Calculate average monthly revenue
    const avgMonthlyRevenue = historicalDeals.length > 0
      ? historicalDeals.reduce((sum, d) => sum + d.value, 0) / 6
      : 0;

    // Get current pipeline
    const pipelineDeals = await this.dealRepository
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL')
      .andWhere('deal.actualCloseDate IS NULL')
      .getMany();

    const pipelineValue = pipelineDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0);

    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= months; i++) {
      const month = new Date();
      month.setMonth(month.getMonth() + i);

      forecast.push({
        month: month.toISOString().substring(0, 7),
        projected: avgMonthlyRevenue,
        pipelineContribution: pipelineValue / months,
        total: avgMonthlyRevenue + (pipelineValue / months),
      });
    }

    return {
      historicalAverage: avgMonthlyRevenue,
      pipelineValue,
      forecast,
    };
  }

  private getDateRange(range: TimeRange): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    switch (range) {
      case TimeRange.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case TimeRange.YESTERDAY:
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case TimeRange.LAST_7_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case TimeRange.LAST_30_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case TimeRange.LAST_90_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 90));
        break;
      case TimeRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case TimeRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    return { startDate, endDate };
  }

  /**
   * Get team performance metrics
   */
  async getTeamPerformance(workspaceId: string, startDate: Date, endDate: Date) {
    this.logger.log(`Getting team performance for workspace ${workspaceId}`);

    // Get all deals with owner information in the date range
    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.owner', 'owner')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.deletedAt IS NULL')
      .andWhere('deal.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    // Group by user
    const userStats = new Map<string, {
      userId: string;
      userName: string;
      dealsCount: number;
      wonDeals: number;
      lostDeals: number;
      totalRevenue: number;
      averageDealSize: number;
      winRate: number;
    }>();

    deals.forEach(deal => {
      if (!deal.owner) return;

      const userId = deal.owner.id;
      const userName = `${deal.owner.firstName} ${deal.owner.lastName}`;

      if (!userStats.has(userId)) {
        userStats.set(userId, {
          userId,
          userName,
          dealsCount: 0,
          wonDeals: 0,
          lostDeals: 0,
          totalRevenue: 0,
          averageDealSize: 0,
          winRate: 0,
        });
      }

      const stats = userStats.get(userId)!;
      stats.dealsCount++;

      if (deal.stage === DealStage.CLOSED_WON) {
        stats.wonDeals++;
        stats.totalRevenue += Number(deal.value);
      } else if (deal.stage === DealStage.CLOSED_LOST) {
        stats.lostDeals++;
      }
    });

    // Calculate averages and rates
    const teamPerformance = Array.from(userStats.values()).map(stats => {
      const closedDeals = stats.wonDeals + stats.lostDeals;
      stats.averageDealSize = stats.wonDeals > 0 ? stats.totalRevenue / stats.wonDeals : 0;
      stats.winRate = closedDeals > 0 ? (stats.wonDeals / closedDeals) * 100 : 0;
      return stats;
    });

    // Sort by total revenue
    teamPerformance.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      teamMembers: teamPerformance,
      summary: {
        totalTeamMembers: teamPerformance.length,
        totalDeals: deals.length,
        totalRevenue: teamPerformance.reduce((sum, t) => sum + t.totalRevenue, 0),
        averageWinRate: teamPerformance.length > 0
          ? teamPerformance.reduce((sum, t) => sum + t.winRate, 0) / teamPerformance.length
          : 0,
      },
    };
  }

  /**
   * Get comprehensive dashboard with all metrics
   */
  async getComprehensiveDashboard(workspaceId: string, range: TimeRange = TimeRange.LAST_30_DAYS) {
    const { startDate, endDate } = this.getDateRange(range);

    const [
      overview,
      salesMetrics,
      contactsMetrics,
      tasksMetrics,
      activityTrend,
      teamPerformance,
    ] = await Promise.all([
      this.getDashboardOverview(workspaceId),
      this.getSalesMetrics(workspaceId, startDate, endDate),
      this.getContactsMetrics(workspaceId, startDate, endDate),
      this.getTasksMetrics(workspaceId, startDate, endDate),
      this.getActivityTrend(workspaceId, startDate, endDate, 'day'),
      this.getTeamPerformance(workspaceId, startDate, endDate),
    ]);

    return {
      timeRange: {
        range,
        startDate,
        endDate,
      },
      overview,
      sales: salesMetrics,
      contacts: contactsMetrics,
      tasks: tasksMetrics,
      activityTrend,
      teamPerformance,
      generatedAt: new Date(),
    };
  }

  /**
   * Get leaderboard for sales team
   */
  async getLeaderboard(workspaceId: string, metric: 'revenue' | 'deals' | 'winRate' = 'revenue', limit: number = 10) {
    const { startDate, endDate } = this.getDateRange(TimeRange.LAST_30_DAYS);
    const teamPerformance = await this.getTeamPerformance(workspaceId, startDate, endDate);

    let sorted = [...teamPerformance.teamMembers];

    switch (metric) {
      case 'revenue':
        sorted.sort((a, b) => b.totalRevenue - a.totalRevenue);
        break;
      case 'deals':
        sorted.sort((a, b) => b.wonDeals - a.wonDeals);
        break;
      case 'winRate':
        sorted.sort((a, b) => b.winRate - a.winRate);
        break;
    }

    return {
      metric,
      timeRange: TimeRange.LAST_30_DAYS,
      leaderboard: sorted.slice(0, limit),
      totalParticipants: sorted.length,
    };
  }
}