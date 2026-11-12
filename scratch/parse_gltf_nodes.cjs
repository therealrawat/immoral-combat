const fs = require('fs');

for (const c of ['amitji', 'chinu', 'modiji', 'priyanshu', 'putin', 'trump']) {
  const buf = fs.readFileSync('models/characters/' + c + '-avatar.glb');
  const str = buf.toString('latin1');
  const jsonStart = str.indexOf('{"asset"');
  let jsonStr = '';
  if (jsonStart !== -1) {
    const chunkLength = buf.readUInt32LE(12);
    jsonStr = buf.toString('utf8', 20, 20 + chunkLength);
  }
  try {
    const gltf = JSON.parse(jsonStr);
    console.log(`\n=== ${c} ===`);
    console.log('Nodes count:', gltf.nodes?.length);
    const meshes = gltf.meshes?.map(m => m.name) || [];
    console.log('Meshes:', meshes);
    const headNodes = gltf.nodes?.filter(n => /head|neck/i.test(n.name)).map(n => n.name);
    console.log('Head/neck nodes:', headNodes);
  } catch (e) {
    console.log('Error parsing gltf JSON for ' + c, e.message);
  }
}

