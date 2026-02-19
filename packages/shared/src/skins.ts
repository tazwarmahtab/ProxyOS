export type AgentRole = 'proxy' | 'minion' | 'scout' | 'sage';

export type SkinId = 'default' | 'portalSciFi';

export interface AgentInfo {
  role: AgentRole;
  displayName: string;
  avatarPath: string;
  color?: number;
}

export interface SkinDefinition {
  id: SkinId;
  name: string;
  description: string;
  /**
   * High-level palette / accent colors used for this skin,
   * primarily for UI theming and subtle glow effects.
   */
  palette: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /**
   * Asset mapping for each agent in this skin.
   */
  agents: AgentInfo[];
}

export const DEFAULT_SKIN_ID: SkinId = 'default';

export const SKINS: Record<SkinId, SkinDefinition> = {
  default: {
    id: 'default',
    name: 'ProxyOS',
    description: 'Clean, minimal avatars tuned for the core ProxyOS experience.',
    palette: {
      primary: '#3b82f6',
      secondary: '#10b981',
      accent: '#a855f7'
    },
    agents: [
      {
        role: 'proxy',
        displayName: 'Proxy',
        avatarPath: '/skins/default/avatar-placeholder.png',
        color: 0x3b82f6,
      },
      {
        role: 'minion',
        displayName: 'Minion',
        avatarPath: '/skins/default/avatar-placeholder.png',
        color: 0x10b981,
      },
      {
        role: 'scout',
        displayName: 'Scout',
        avatarPath: '/skins/default/avatar-placeholder.png',
        color: 0x8b5cf6,
      },
      {
        role: 'sage',
        displayName: 'Sage',
        avatarPath: '/skins/default/avatar-placeholder.png',
        color: 0xf59e0b,
      },
    ],
  },
  portalSciFi: {
    id: 'portalSciFi',
    name: 'Portal Sci‑Fi',
    description:
      'Original portal-sci‑fi cartoon cast with glowing lab gear and neon accents. Legally safe, inspired by high‑energy multiverse vibes.',
    palette: {
      primary: '#22d3ee', // cyan
      secondary: '#a855f7', // purple
      accent: '#4ade80' // green
    },
    agents: [
      {
        role: 'proxy',
        displayName: 'Operator',
        avatarPath: '/skins/portalSciFi/avatar-placeholder.png',
        color: 0x22d3ee,
      },
      {
        role: 'minion',
        displayName: 'GadgetCoder',
        avatarPath: '/skins/portalSciFi/avatar-placeholder.png',
        color: 0x00f5ff,
      },
      {
        role: 'scout',
        displayName: 'SignalHunter',
        avatarPath: '/skins/portalSciFi/avatar-placeholder.png',
        color: 0x39ff14,
      },
      {
        role: 'sage',
        displayName: 'ColdReviewer',
        avatarPath: '/skins/portalSciFi/avatar-placeholder.png',
        color: 0xa855f7,
      },
    ],
  }
};

/**
 * Resolve a skin by id, falling back to the default skin when unknown.
 */
export function getSkinById(id: string | null | undefined): SkinDefinition {
  if (!id) return SKINS[DEFAULT_SKIN_ID];
  return SKINS[(id as SkinId) in SKINS ? (id as SkinId) : DEFAULT_SKIN_ID];
}

/**
 * Alias for getSkinById for convenience.
 */
export function getSkin(id: SkinId | string | null | undefined): SkinDefinition {
  return getSkinById(id);
}

/**
 * Type alias for SkinDefinition (commonly used as "Skin").
 */
export type Skin = SkinDefinition;
