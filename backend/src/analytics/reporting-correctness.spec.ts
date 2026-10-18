import { BadRequestException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

/**
 * From the branch review: /analytics/kpis/trend took its dates straight off
 * the query string with no DTO. Calling it with no parameters threw a
 * RangeError (500), and a decade-wide range fanned out one set of queries per
 * day through Promise.all — thousands of concurrent queries, from any role.
 */
function build() {
  const analyticsService = {
    getKPITrend: jest.fn().mockResolvedValue({ data: [], summary: {} }),
    getDailyKPIs: jest.fn().mockResolvedValue({}),
    generateEODReport: jest.fn().mockResolvedValue({}),
  };
  return { controller: new AnalyticsController(analyticsService as any), analyticsService };
}

const user = { id: 'u-1', role: 'manager' };

describe('GET /analytics/kpis/trend', () => {
  it('accepts an ordinary range', async () => {
    const { controller, analyticsService } = build();

    await controller.getKPITrend('ws-1', '2026-10-01', '2026-10-18');

    expect(analyticsService.getKPITrend).toHaveBeenCalled();
  });

  it('refuses a request with no dates instead of throwing a 500', async () => {
    const { controller } = build();

    await expect(controller.getKPITrend('ws-1', undefined as any, undefined as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses dates it cannot read', async () => {
    const { controller } = build();

    await expect(controller.getKPITrend('ws-1', 'ieri', '2026-10-18')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a range that ends before it starts', async () => {
    const { controller } = build();

    await expect(controller.getKPITrend('ws-1', '2026-10-18', '2026-10-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // A decade is ~3,650 days, each firing its own set of queries at once.
  it('refuses a range wide enough to exhaust the connection pool', async () => {
    const { controller } = build();

    await expect(controller.getKPITrend('ws-1', '2015-01-01', '2026-10-18')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('GET /analytics/kpis/daily — who it is about', () => {
  it('pins a caller to their own numbers', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs('ws-1', { id: 'me', role: 'caller' }, undefined, 'someone-else');

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith('ws-1', undefined, 'me');
  });

  it('lets a manager ask about the workspace', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs('ws-1', user, undefined, undefined);

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith('ws-1', undefined, undefined);
  });
});
