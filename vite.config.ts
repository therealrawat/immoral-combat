import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Parses `.env` files cleanly, supporting both `KEY=value` and colon-separated
 * `KEY: "value"` assignments while keeping secrets on the build/server side.
 */
function parseEnvEntries(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function loadChinuPasswordFromEnv(rootDir: string): string {
  const merged: Record<string, string> = {};
  for (const fileName of ['.env', '.env.local']) {
    const fullPath = path.join(rootDir, fileName);
    if (fs.existsSync(fullPath)) {
      Object.assign(merged, parseEnvEntries(fs.readFileSync(fullPath, 'utf8')));
    }
  }

  return (
    merged.CHINU_KEY ||
    merged.CHINU_PASSWORD ||
    merged.VITE_CHINU_PASSWORD ||
    merged.PASSWORD ||
    process.env.CHINU_KEY ||
    process.env.CHINU_PASSWORD ||
    process.env.PASSWORD ||
    ''
  ).trim();
}

const chinuPassword = loadChinuPasswordFromEnv(__dirname);
const chinuSalt = createHash('sha256')
  .update(`immoral-combat-sacred-salt:${chinuPassword}`)
  .digest('hex')
  .slice(0, 16);
const chinuHash = chinuPassword
  ? createHash('sha256').update(`${chinuSalt}:${chinuPassword}`).digest('hex')
  : '';

export default defineConfig({
  assetsInclude: ['**/*.glb', '**/*.ogg'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/gsap')) return 'vendor-gsap';
        },
      },
    },
  },
  define: {
    __CHINU_KEY_SALT__: JSON.stringify(chinuSalt),
    __CHINU_KEY_HASH__: JSON.stringify(chinuHash),
    __CHINU_KEY_CONFIGURED__: JSON.stringify(Boolean(chinuPassword)),
  },
});
