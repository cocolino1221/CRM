import api from './api';

import type { ChannelAccess, ChannelKey } from './channel-access';

export type WorkspaceChannelAvailability = ChannelAccess;

const DISCONNECTED_STATUSES = new Set(['disabled', 'expired', 'suspended', 'error']);

export const DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY: WorkspaceChannelAvailability = {
  whatsapp: false,
  messenger: false,
  instagram: false,
  tiktok: false,
};

function normalizeValue(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isConnectedIntegration(row: any): boolean {
  const status = normalizeValue(row?.status);
  return !DISCONNECTED_STATUSES.has(status);
}

function getIntegrationKeys(row: any): string[] {
  return [
    normalizeValue(row?.type),
    normalizeValue(row?.externalId),
    normalizeValue(row?.config?.provider),
  ].filter(Boolean);
}

function integrationMatches(keys: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => keys.includes(candidate));
}

export function resolveWorkspaceChannelAvailability(rows: any[]): WorkspaceChannelAvailability {
  const availability = { ...DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY };

  rows
    .filter(isConnectedIntegration)
    .forEach((row) => {
      const keys = getIntegrationKeys(row);

      if (integrationMatches(keys, ['whatsapp'])) {
        availability.whatsapp = true;
      }
      if (integrationMatches(keys, ['facebook'])) {
        availability.messenger = true;
      }
      if (integrationMatches(keys, ['instagram'])) {
        availability.instagram = true;
      }
      if (integrationMatches(keys, ['tiktok'])) {
        availability.tiktok = true;
      }
    });

  return availability;
}

export async function fetchWorkspaceChannelAvailability(): Promise<WorkspaceChannelAvailability> {
  const response = await api.get('/integrations');
  const rows = Array.isArray(response.data?.integrations) ? response.data.integrations : [];
  return resolveWorkspaceChannelAvailability(rows);
}

export function filterConnectedChannels(
  availability: WorkspaceChannelAvailability,
  channels: ChannelKey[],
): ChannelKey[] {
  return channels.filter((channel) => availability[channel]);
}
