import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.window = globalThis;

const loader = new GLTFLoader();
const data = fs.readFileSync('models/animations/Run/Running.glb');
const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

loader.parse(ab, '', (gltf) => {
  const anim = gltf.animations[0];
  console.log('Original clip tracks:', anim.tracks.length);
  for (const track of anim.tracks) {
    if (track.name.toLowerCase().includes('hips.position')) {
      const vals = track.values;
      console.log('Sample original hips pos values (first 3 frames):');
      for (let f = 0; f < 3; f++) {
        console.log(`  Frame ${f}: x=${vals[f*3].toFixed(3)}, y=${vals[f*3+1].toFixed(3)}, z=${vals[f*3+2].toFixed(3)}`);
      }
      // If stripped:
      console.log('If horizontal motion is stripped: x and z delta become 0, only y (vertical bobbing) remains!');
    }
  }
});

