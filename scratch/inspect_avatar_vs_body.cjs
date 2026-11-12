const fs = require('fs');
for (const c of ['amitji', 'chinu', 'modiji', 'priyanshu', 'putin', 'trump']) {
  for (const type of ['avatar', 'body']) {
    const filename = `models/characters/${c}-${type}.glb`;
    if (!fs.existsSync(filename)) continue;
    const buf = fs.readFileSync(filename);
    const str = buf.toString('latin1');
    const meshNames = [...str.matchAll(/"meshes"\s*:\s*\[([\s\S]*?)\]/g)];
    const nodeNames = [];
    const re = /"name"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      nodeNames.push(m[1]);
    }
    console.log(`${c}-${type}: size=${buf.length}, nodes=${nodeNames.length}, head/hair/face/body:`, nodeNames.filter(n => /head|hair|face|body|eye|teeth|mouth|armature|root/i.test(n)));
  }
}

