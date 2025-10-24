export interface DailyKPI {
  date: string;
  newContacts: number;
  newDeals: number;
  dealsWon: number;
  dealsLost: number;
  revenue: number;
  activitiesCompleted: number;
  tasksCompleted: number;
  callsMade: number;
  emailsSent: number;
  meetingsHeld: number;
  averageResponseTime: number; // in hours
  conversionRate: number; // percentage
  pipelineValue: number;
  teamSize: number;
}

export interface WeeklyKPI extends DailyKPI {
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
}

export interface MonthlyKPI extends DailyKPI {
  month: string;
  monthName: string;
}

export interface EODReport {
  date: string;
  workspaceId: string;
  summary: {
    newContacts: number;
    newDeals: number;
    dealsWonToday: number;
    dealsLostToday: number;
    revenueToday: number;
    activitiesCompleted: number;
    tasksCompleted: number;
    callsMade: number;
    emailsSent: number;
    meetingsHeld: number;
  };
  teamPerformance: Array<{
    userId: string;
    userName: string;
    activitiesCompleted: number;
    dealsCreated: number;
    dealsWon: number;
    revenueGenerated: number;
  }>;
  pipeline: {
    totalValue: number;
    totalDeals: number;
    hotDeals: number;
    atRiskDeals: number;
  };
  topWins: Array<{
    dealName: string;
    value: number;
    closedBy: string;
  }>;
  actionItems: {
    overdueTasks: number;
    followUpsNeeded: number;
    dealsRequiringAttention: number;
  };
  generatedAt: Date;
}

export class GetKPIDto {
  date?: string;
  startDate?: string;
  endDate?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}
