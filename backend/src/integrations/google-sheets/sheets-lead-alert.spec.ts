import { GoogleSheetsService } from './google-sheets.service';
import { UserRole, UserStatus } from '../../database/entities/user.entity';

const WORKSPACE = 'workspace-1';
const CONNECTOR = 'admin-who-connected-google';

/**
 * A new lead from the sheet only ever told one person: the user who ran the
 * Google OAuth. In production all 145 `lead:sheets` notifications had gone to
 * the same admin and the three closers had none, which is what "de ce nu
 * primesc closerii notificare cand un lead e adaugat din google sheet" was.
 *
 * The team fan-out follows scheduling.service's alertCallers.
 */
function build(team: any[] = []) {
  const notifications = { notifyLead: jest.fn().mockResolvedValue(undefined) };
  const userRepository = { find: jest.fn().mockResolvedValue(team) };

  const service = new GoogleSheetsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    notifications as any,
    userRepository as any,
  );

  return { service, notifications, userRepository };
}

const integration = { workspaceId: WORKSPACE, userId: CONNECTOR } as any;
const contact = { id: 'contact-1', firstName: 'Ana', lastName: 'Pop', phone: '+40700', email: 'a@b.ro' } as any;
const config = { spreadsheetName: 'Leaduri', sheetName: 'Octombrie' } as any;

const recipients = (notifyLead: jest.Mock) => notifyLead.mock.calls.map((c) => c[1]);

describe('GoogleSheetsService.notifyNewSheetLead', () => {
  it('tells every active caller and closer, not only whoever connected Google', async () => {
    const { service, notifications } = build([
      { id: 'closer-1', role: UserRole.CLOSER },
      { id: 'caller-1', role: UserRole.CALLER },
    ]);

    await service.notifyNewSheetLead(integration, contact, config);

    expect(recipients(notifications.notifyLead)).toEqual(
      expect.arrayContaining(['closer-1', 'caller-1']),
    );
  });

  // The admin was getting these before; the fix adds people rather than
  // moving the notification off them.
  it('still tells whoever connected Google', async () => {
    const { service, notifications } = build([{ id: 'closer-1', role: UserRole.CLOSER }]);

    await service.notifyNewSheetLead(integration, contact, config);

    expect(recipients(notifications.notifyLead)).toContain(CONNECTOR);
  });

  it('tells someone once when they both connected Google and close', async () => {
    const { service, notifications } = build([{ id: CONNECTOR, role: UserRole.CLOSER }]);

    await service.notifyNewSheetLead(integration, contact, config);

    expect(recipients(notifications.notifyLead)).toEqual([CONNECTOR]);
  });

  it('asks only for active callers and closers of this workspace', async () => {
    const { service, userRepository } = build();

    await service.notifyNewSheetLead(integration, contact, config);

    const where = userRepository.find.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.arrayContaining([
        { workspaceId: WORKSPACE, status: UserStatus.ACTIVE, role: UserRole.CALLER },
        { workspaceId: WORKSPACE, status: UserStatus.ACTIVE, role: UserRole.CLOSER },
      ]),
    );
  });

  it('names the lead and the sheet it came from', async () => {
    const { service, notifications } = build([{ id: 'closer-1', role: UserRole.CLOSER }]);

    await service.notifyNewSheetLead(integration, contact, config);

    const [, , source, , message, link] = notifications.notifyLead.mock.calls[0];
    expect(source).toBe('sheets');
    expect(message).toContain('Ana Pop');
    expect(message).toContain('Leaduri');
    expect(link).toBe('/leads/contact-1');
  });

  // One closer's push failing must not cost the rest of the team the lead.
  it('keeps telling the others when one notification fails', async () => {
    const { service, notifications } = build([
      { id: 'closer-1', role: UserRole.CLOSER },
      { id: 'closer-2', role: UserRole.CLOSER },
    ]);
    notifications.notifyLead.mockRejectedValueOnce(new Error('push down'));

    await expect(service.notifyNewSheetLead(integration, contact, config)).resolves.toBeUndefined();
    expect(notifications.notifyLead).toHaveBeenCalledTimes(3);
  });

  it('does nothing when there is nobody to tell', async () => {
    const { service, notifications } = build();

    await service.notifyNewSheetLead({ workspaceId: WORKSPACE } as any, contact, config);

    expect(notifications.notifyLead).not.toHaveBeenCalled();
  });
});
