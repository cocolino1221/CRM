import { AnalyticsService } from '../../analytics/analytics.service';
import { TimeRange } from '../../analytics/dto/date-range.dto';
import { ToolDef } from './tool.types';

export interface AnalyticsReadToolsDeps {
  analytics: AnalyticsService;
}

/**
 * Read-only MCP tools over AnalyticsService. Every handler pulls
 * `workspaceId` from the auth context — never from tool input.
 */
export function createAnalyticsReadTools(deps: AnalyticsReadToolsDeps): ToolDef[] {
  return [
    {
      name: 'get_analytics_summary',
      description: 'Get the comprehensive analytics dashboard for the current workspace over a time range.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            enum: Object.values(TimeRange),
            description: 'Time range preset (defaults to last_30_days)',
          },
        },
      },
      handler: async (input, ctx) => {
        return deps.analytics.getComprehensiveDashboard(
          ctx.workspaceId,
          input?.range ?? TimeRange.LAST_30_DAYS,
        );
      },
    },
  ];
}
