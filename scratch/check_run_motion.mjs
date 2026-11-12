import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.window = globalThis;

const loader = new GLTFLoader();
for (const file of ['Running.glb', 'Running (1).glb', 'Running Backward.glb', 'Fight-Walking.glb', 'Walking.glb']) {
  const p = file.includes('Walk') ? 'models/animations/Walk/' + file : 'models/animations/Run/' + file;
  if (!fs.existsSync(p)) continue;
  const data = fs.readFileSync(p);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  loader.parse(ab, '', (gltf) => {
    const anim = gltf.animations[0];
    if (!anim) {
      console.log(file, 'no animations');
      return;
    }
    console.log(`\n=== ${file} === duration: ${anim.duration.toFixed(2)}s, tracks: ${anim.tracks.length}`);
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
        console.log(`  Track: ${track.name}`);
        console.log(`    deltaX: ${(maxX - minX).toFixed(3)}, deltaZ: ${(maxZ - minZ).toFixed(3)}`);
      }
    }
  });
}

