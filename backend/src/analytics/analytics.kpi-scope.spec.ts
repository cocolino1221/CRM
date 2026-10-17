import { AnalyticsController } from './analytics.controller';

const WORKSPACE = 'workspace-1';

function build() {
  const analyticsService: any = {
    getDailyKPIs: jest.fn().mockResolvedValue({}),
    generateEODReport: jest.fn().mockResolvedValue({}),
  };
  return { controller: new AnalyticsController(analyticsService), analyticsService };
}

const asUser = (role: string, id = 'user-self') => ({ id, role });

describe('AnalyticsController — who a report is about', () => {
  it('gives a manager the whole workspace when they ask for no one in particular', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('manager'), undefined, undefined);

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, undefined);
  });

  it('lets a manager ask about one caller', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('manager'), undefined, 'user-caller');

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, 'user-caller');
  });

  it('lets an admin ask about one caller', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('admin'), undefined, 'user-caller');

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, 'user-caller');
  });

  // The report must not become a way to read a colleague's numbers, or the
  // whole team's, by editing a query string.
  it('pins a caller to their own numbers however they ask', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('caller', 'user-self'), undefined, 'user-other');

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, 'user-self');
  });

  it('pins a caller to their own numbers when they name no one', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('caller', 'user-self'), undefined, undefined);

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, 'user-self');
  });

  it('pins a closer to their own numbers too', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('closer', 'user-self'), undefined, '');

    expect(analyticsService.getDailyKPIs).toHaveBeenCalledWith(WORKSPACE, undefined, 'user-self');
  });

  it('passes the date through', async () => {
    const { controller, analyticsService } = build();

    await controller.getDailyKPIs(WORKSPACE, asUser('manager'), '2026-10-17', undefined);

    const [, date] = analyticsService.getDailyKPIs.mock.calls[0];
    expect(date).toEqual(new Date('2026-10-17'));
  });
});
