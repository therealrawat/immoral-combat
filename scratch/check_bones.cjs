const fs = require('fs');
const chars = ['amitji', 'chinu', 'modiji', 'priyanshu', 'putin', 'trump'];
for (const c of chars) {
  const buf = fs.readFileSync('models/characters/' + c + '-avatar.glb');
  const str = buf.toString('latin1');
  const regex = /"name"\s*:\s*"([^"]*(?:head|neck)[^"]*)"/gi;
  const found = [];
  let m;
  while ((m = regex.exec(str)) !== null) {
    found.push(m[1]);
  }
  console.log(c, [...new Set(found)]);
}

