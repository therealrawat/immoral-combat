import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.window = globalThis;

const loader = new GLTFLoader();
const dir = 'models/animations/Hit';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb'));

for (const file of files) {
  const data = fs.readFileSync(dir + '/' + file);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  loader.parse(ab, '', (gltf) => {
    const anim = gltf.animations[0];
    console.log(`\n=== ${file} ===`);
    console.log('Duration:', anim.duration.toFixed(2), 'seconds');
    console.log('Tracks count:', anim.tracks.length);
    for (const track of anim.tracks) {
      if (track.name.toLowerCase().includes('hips.position')) {
        const vals = track.values;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < vals.length; i += 3) {
          minX = Math.min(minX, vals[i]);
          maxX = Math.max(maxX, vals[i]);
          minZ = Math.min(minZ, vals[i + 2]);
          maxZ = Math.max(maxZ, vals[i + 2]);
        }
        console.log(`  Hips Pos Delta: X=${(maxX-minX).toFixed(1)}, Z=${(maxZ-minZ).toFixed(1)}`);
      }
    }
  });
}

