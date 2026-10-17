import { BadRequestException } from '@nestjs/common';
import { TypeformIntegrationHandler } from './typeform.handler';

const WS = 'ws-1';

function makeHandler(pipelines: any[], stages: any[]) {
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
  const pipelineRepository = {
    findOne: jest.fn(async ({ where }) => pipelines.find((p) => matches(p, where)) || null),
  };
  const pipelineStageRepository = {
    findOne: jest.fn(async ({ where }) => stages.find((s) => matches(s, where)) || null),
    find: jest.fn(async ({ where }) =>
      stages.filter((s) => matches(s, where)).sort((a, b) => a.displayOrder - b.displayOrder),
    ),
  };
  return new TypeformIntegrationHandler(
    {} as any,
    {} as any,
    {} as any,
    pipelineRepository as any,
    pipelineStageRepository as any,
  );
}

const pipelines = [
  { id: 'p-default', workspaceId: WS, isDefault: true },
  { id: 'p-sales', workspaceId: WS, isDefault: false },
  { id: 'p-other-ws', workspaceId: 'ws-2', isDefault: true },
];
const stages = [
  { id: 's-def-2', pipelineId: 'p-default', workspaceId: WS, displayOrder: 2 },
  { id: 's-def-1', pipelineId: 'p-default', workspaceId: WS, displayOrder: 1 },
  { id: 's-sales-1', pipelineId: 'p-sales', workspaceId: WS, displayOrder: 1 },
  { id: 's-sales-2', pipelineId: 'p-sales', workspaceId: WS, displayOrder: 2 },
];

describe('Typeform pipeline routing', () => {
  const handler = makeHandler(pipelines, stages);

  it('uses the configured pipeline and stage', async () => {
    await expect(handler.resolvePipelineTarget(WS, 'p-sales', 's-sales-2')).resolves.toEqual({
      pipelineId: 'p-sales',
      pipelineStageId: 's-sales-2',
    });
  });

  it('falls back to the first stage by order when no stage is set', async () => {
    await expect(handler.resolvePipelineTarget(WS, 'p-sales')).resolves.toEqual({
      pipelineId: 'p-sales',
      pipelineStageId: 's-sales-1',
    });
  });

  it('ignores a stage that belongs to another pipeline', async () => {
    await expect(handler.resolvePipelineTarget(WS, 'p-sales', 's-def-1')).resolves.toEqual({
      pipelineId: 'p-sales',
      pipelineStageId: 's-sales-1',
    });
  });

  it('uses the default pipeline when none is configured or it was deleted', async () => {
    const expected = { pipelineId: 'p-default', pipelineStageId: 's-def-1' };
    await expect(handler.resolvePipelineTarget(WS)).resolves.toEqual(expected);
    await expect(handler.resolvePipelineTarget(WS, 'p-gone')).resolves.toEqual(expected);
  });

  it('never routes into another workspace pipeline', async () => {
    await expect(handler.resolvePipelineTarget(WS, 'p-other-ws')).resolves.toEqual({
      pipelineId: 'p-default',
      pipelineStageId: 's-def-1',
    });
  });

  it('rejects invalid selections when saving', async () => {
    await expect(handler.validatePipelineSelection(WS, 'p-other-ws')).rejects.toBeInstanceOf(BadRequestException);
    await expect(handler.validatePipelineSelection(WS, 'p-sales', 's-def-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(handler.validatePipelineSelection(WS, null, 's-sales-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(handler.validatePipelineSelection(WS, 'p-sales', 's-sales-2')).resolves.toBeUndefined();
    await expect(handler.validatePipelineSelection(WS, null, null)).resolves.toBeUndefined();
  });
});
