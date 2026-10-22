import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { MetaConversionsService } from './meta-conversions.service';
import { Integration, IntegrationStatus } from '../../database/entities/integration.entity';

const WORKSPACE = 'workspace-123';
const USER = 'user-1';
const DATASET = '975950368711042';
/** 219 chars of URL-safe characters, the shape of a real system-user token. */
const GOOD_TOKEN = 'EAA' + 'Qwerty1234_-'.repeat(18);

// A malformed token is only reported by Meta when an event is posted, as the
// Graph error "Bad signature" — hours after the paste, on a page the person is
// no longer looking at. Checking at save time is what makes it fixable.
describe('MetaConversionsService.saveConfig — checking the access token', () => {
  let service: MetaConversionsService;
  let repo: any;
  let http: any;

  const existing = () => ({
    id: 'integration-1',
    workspaceId: WORKSPACE,
    status: IntegrationStatus.ACTIVE,
    config: { datasetId: DATASET },
    credentials: { accessToken: GOOD_TOKEN },
    lastSync: { timestamp: new Date('2026-10-22T17:52:46.796Z'), status: 'error', error: 'Bad signature' },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaConversionsService,
        {
          provide: getRepositoryToken(Integration),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((data: any) => ({ ...data })),
            save: jest.fn().mockImplementation(async (entity: any) => entity),
            remove: jest.fn(),
          },
        },
        { provide: HttpService, useValue: { axiosRef: { get: jest.fn(), post: jest.fn() } } },
      ],
    }).compile();

    service = module.get(MetaConversionsService);
    repo = module.get(getRepositoryToken(Integration));
    http = module.get(HttpService);
  });

  /** Graph's answer when the token is good. */
  const graphSaysValid = () =>
    http.axiosRef.get.mockResolvedValue({ data: { data: { is_valid: true, app_id: '123', scopes: ['ads_management'] } } });

  it('refuses a token that cannot possibly be one, without asking Meta', async () => {
    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: 'E'.repeat(2698) }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(http.axiosRef.get).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('says how long the pasted value was, so the person can see what happened', async () => {
    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: 'E'.repeat(2698) }),
    ).rejects.toThrow(/2698 characters/);
  });

  it('asks Graph to verify a token that looks right, passing it as both parameters', async () => {
    graphSaysValid();

    await service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN });

    const [url, options] = http.axiosRef.get.mock.calls[0];
    expect(url).toContain('/debug_token');
    expect(options.params).toEqual(
      expect.objectContaining({ input_token: GOOD_TOKEN, access_token: GOOD_TOKEN }),
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('refuses a token Meta itself reports as invalid, quoting Meta', async () => {
    http.axiosRef.get.mockResolvedValue({
      data: { data: { is_valid: false, error: { message: 'Session has expired' } } },
    });

    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN }),
    ).rejects.toThrow(/Session has expired/);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('refuses a token Graph rejects outright, quoting Graph', async () => {
    http.axiosRef.get.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Bad signature' } } },
    });

    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN }),
    ).rejects.toThrow(/Bad signature/);

    expect(repo.save).not.toHaveBeenCalled();
  });

  // Our own connectivity is not the person's problem: a token that looks right
  // is stored, and the test-event button is still there to prove it works.
  it('stores the token when Meta cannot be reached at all', async () => {
    http.axiosRef.get.mockRejectedValue(Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }));

    await service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN });

    expect(repo.save).toHaveBeenCalled();
  });

  it('clears the stale error once a new token has been verified', async () => {
    repo.findOne.mockResolvedValue(existing());
    graphSaysValid();

    await service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN });

    expect(repo.save.mock.calls[0][0].lastSync).toBeNull();
  });

  it('leaves the last event alone when only the dataset or the toggle changed', async () => {
    repo.findOne.mockResolvedValue(existing());

    await service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, enabled: false });

    expect(http.axiosRef.get).not.toHaveBeenCalled();
    expect(repo.save.mock.calls[0][0].lastSync).toEqual(
      expect.objectContaining({ error: 'Bad signature' }),
    );
  });

  // Verified against the live API: Graph answers a bad token with
  // {"error":{"message":"Malformed access token EAA…"}}, token included.
  it('never puts the token itself into the error it shows', async () => {
    http.axiosRef.get.mockRejectedValue({
      response: { status: 400, data: { error: { message: `Malformed access token ${GOOD_TOKEN}` } } },
    });

    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN }),
    ).rejects.toThrow(/Malformed access token/);

    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: DATASET, accessToken: GOOD_TOKEN }),
    ).rejects.not.toThrow(new RegExp(GOOD_TOKEN));
  });

  it('keeps the token out of the error it stores under "Last event"', async () => {
    repo.findOne.mockResolvedValue(existing());
    http.axiosRef.post.mockRejectedValue({
      response: { status: 400, data: { error: { message: `Malformed access token ${GOOD_TOKEN}` } } },
    });

    await expect(service.sendTestEvent(WORKSPACE)).rejects.toThrow(/Malformed access token/);

    const stored = repo.save.mock.calls[0][0].lastSync;
    expect(stored.status).toBe('error');
    expect(stored.error).not.toContain(GOOD_TOKEN);
    expect(stored.error).toContain('[token]');
  });

  it('rejects a dataset id that is not the numeric one from Events Manager', async () => {
    await expect(
      service.saveConfig(WORKSPACE, USER, { datasetId: 'my dataset', accessToken: GOOD_TOKEN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
