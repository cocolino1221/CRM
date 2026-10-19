import { BookingsController } from './bookings.controller';

/**
 * Who sees which bookings in the calendar: a closer only the meetings they
 * hold, a caller only those of leads they are tagged on, everyone else the
 * whole team.
 */
describe('BookingsController.findAll — calendar scope', () => {
  function build() {
    const bookingsService = { findAll: jest.fn().mockResolvedValue([]) };
    const controller = new BookingsController(bookingsService as any, {} as any);
    return { controller, bookingsService };
  }
  const call = (controller: BookingsController, role: string, hostId?: string) =>
    (controller as any).findAll('ws', hostId, undefined, undefined, undefined, { user: { id: 'me', role } });

  it('a closer gets only their own meetings, whatever hostId they ask for', async () => {
    const { controller, bookingsService } = build();
    await call(controller, 'closer', 'someone-else');
    expect(bookingsService.findAll.mock.calls[0][1]).toMatchObject({ hostId: 'me', assignedTo: undefined });
  });

  it('a caller gets the meetings of the leads they are tagged on', async () => {
    const { controller, bookingsService } = build();
    await call(controller, 'caller');
    expect(bookingsService.findAll.mock.calls[0][1]).toMatchObject({ assignedTo: 'me' });
  });

  it('a manager sees the team, or the host they filter on', async () => {
    const { controller, bookingsService } = build();
    await call(controller, 'manager', 'h2');
    expect(bookingsService.findAll.mock.calls[0][1]).toMatchObject({ hostId: 'h2', assignedTo: undefined });
  });
});
