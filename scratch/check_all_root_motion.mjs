import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.window = globalThis;

const loader = new GLTFLoader();

function scanDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDir(full));
    } else if (entry.name.endsWith('.glb')) {
      files.push(full);
    }
  }
  return files;
}

const allAnimFiles = scanDir('models/animations');

console.log(`Checking root motion across all ${allAnimFiles.length} animations:`);

for (const f of allAnimFiles) {
  const data = fs.readFileSync(f);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  loader.parse(ab, '', (gltf) => {
    const anim = gltf.animations[0];
    if (!anim) return;
    for (const track of anim.tracks) {
      if (track.name.toLowerCase().includes('position')) {
        const vals = track.values;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < vals.length; i += 3) {
          minX = Math.min(minX, vals[i]);
          maxX = Math.max(maxX, vals[i]);
          minZ = Math.min(minZ, vals[i + 2]);
          maxZ = Math.max(maxZ, vals[i + 2]);
        }
        const deltaX = maxX - minX;
        const deltaZ = maxZ - minZ;
        if (deltaX > 10 || deltaZ > 10) {
          console.log(`  [HAS ROOT MOTION] ${path.relative('models/animations', f)}: deltaX=${deltaX.toFixed(1)}, deltaZ=${deltaZ.toFixed(1)}`);
        }
      }
    }
  });
}

