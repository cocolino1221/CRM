export type ChannelKey = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok';

export interface ChannelAccess {
  whatsapp: boolean;
  messenger: boolean;
  instagram: boolean;
  tiktok: boolean;
}

export interface UserLikeWithAccess {
  role?: string | null;
  preferences?: Record<string, any> | null;
}

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const DEFAULT_CHANNEL_ACCESS: ChannelAccess = {
  whatsapp: true,
  messenger: true,
  instagram: true,
  tiktok: true,
};

export function getDefaultChannelAccessForRole(role?: string | null): ChannelAccess {
  const normalized = String(role || '').trim().toLowerCase();
  if (['manager', 'admin', 'super_admin'].includes(normalized)) {
    return { ...DEFAULT_CHANNEL_ACCESS };
  }

  return { ...DEFAULT_CHANNEL_ACCESS };
}

export function resolveChannelAccess(user?: UserLikeWithAccess | null): ChannelAccess {
  const roleDefaults = getDefaultChannelAccessForRole(user?.role);
  const normalizedRole = String(user?.role || '').trim().toLowerCase();

  if (['manager', 'admin', 'super_admin'].includes(normalizedRole)) {
    return roleDefaults;
  }

  const saved = (user?.preferences as any)?.channelAccess || {};

  return {
    whatsapp: typeof saved.whatsapp === 'boolean' ? saved.whatsapp : roleDefaults.whatsapp,
    messenger: typeof saved.messenger === 'boolean' ? saved.messenger : roleDefaults.messenger,
    instagram: typeof saved.instagram === 'boolean' ? saved.instagram : roleDefaults.instagram,
    tiktok: typeof saved.tiktok === 'boolean' ? saved.tiktok : roleDefaults.tiktok,
  };
}

export function hasChannelAccess(user: UserLikeWithAccess | null | undefined, channel: ChannelKey): boolean {
  return resolveChannelAccess(user)[channel];
}
