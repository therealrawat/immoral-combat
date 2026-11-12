import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'fs';

globalThis.self = globalThis;
globalThis.window = globalThis;

const chars = ['amitji', 'chinu', 'modiji', 'priyanshu', 'putin', 'trump'];

async function testPortraits() {
  for (const c of chars) {
    const data = fs.readFileSync('models/characters/' + c + '-avatar.glb');
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const loader = new GLTFLoader();
    await new Promise((resolve) => {
      loader.parse(arrayBuffer, '', (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        const rawHeight = bounds.max.y - bounds.min.y;
        const targetWorldHeight = 1.8 * 1.0;
        const scale = rawHeight > 0.2 ? targetWorldHeight / rawHeight : 1.0;
        const groundY = -bounds.min.y * scale + 0.004;
        scene.scale.setScalar(scale);
        scene.position.set(0, groundY, 0);
        scene.updateMatrixWorld(true);

        const cloned = SkeletonUtils.clone(scene);
        const holder = new THREE.Group();
        holder.add(cloned);
        holder.updateMatrixWorld(true);

        const headWorld = new THREE.Vector3();
        const neckWorld = new THREE.Vector3();
        const headBone = cloned.getObjectByName('Head');
        const neckBone = cloned.getObjectByName('Neck');
        const fullBounds = new THREE.Box3().setFromObject(holder);
        const topY = fullBounds.max.y;

        if (headBone) headBone.getWorldPosition(headWorld);
        if (neckBone) neckBone.getWorldPosition(neckWorld);

        const cutY = THREE.MathUtils.lerp(neckWorld.y, headWorld.y, 0.36);
        const spanY = THREE.MathUtils.clamp(topY - cutY, 0.24, 0.52);
        const centerY = (cutY + topY) * 0.5;

        console.log(`=== ${c} ===`);
        console.log('topY:', topY.toFixed(3));
        console.log('headBone found:', !!headBone, 'headWorld:', headWorld.x.toFixed(3), headWorld.y.toFixed(3), headWorld.z.toFixed(3));
        console.log('neckBone found:', !!neckBone, 'neckWorld:', neckWorld.x.toFixed(3), neckWorld.y.toFixed(3), neckWorld.z.toFixed(3));
        console.log('cutY:', cutY.toFixed(3), 'spanY:', spanY.toFixed(3), 'centerY:', centerY.toFixed(3));
        console.log('Z bounds: minZ=', fullBounds.min.z.toFixed(3), 'maxZ=', fullBounds.max.z.toFixed(3));
        resolve();
      }, (e) => {
        console.log('Error parsing ' + c, e);
        resolve();
      });
    });
  }
}

testPortraits();

