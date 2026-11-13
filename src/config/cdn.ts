/**
 * Cloudflare R2 CDN base URL hosting 3D game models, textures, animations, and sound assets.
 */
export const ASSET_CDN = 'https://pub-fb31e6086d984a29beb2f72346b229ec.r2.dev';

/**
 * Resolves a full CDN URL given a relative asset path (e.g. `models/characters/chinu-avatar.glb`).
 */
export function getCdnAssetUrl(relativePath: string): string {
  const clean = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${ASSET_CDN}${clean}`;
}

