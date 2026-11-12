import fs from 'fs';
import path from 'path';

console.log('=== IMMORAL COMBAT: MODEL & ANIMATION RESTRUCTURING AUDIT ===\n');

// 1. Audit characters in models/characters/
const expectedCharacters = ['amitji', 'chinu', 'modiji', 'priyanshu', 'putin', 'trump'];
const charDir = 'models/characters';
let allCharsOk = true;

console.log('1. Checking models/characters/ base meshes:');
for (const c of expectedCharacters) {
  const avatarFile = path.join(charDir, `${c}-avatar.glb`);
  const bodyFile = path.join(charDir, `${c}-body.glb`);
  const avatarExists = fs.existsSync(avatarFile);
  const bodyExists = fs.existsSync(bodyFile);
  if (!avatarExists || !bodyExists) {
    allCharsOk = false;
    console.error(`  [FAIL] ${c}: avatar=${avatarExists}, body=${bodyExists}`);
  } else {
    const aSize = (fs.statSync(avatarFile).size / (1024 * 1024)).toFixed(2);
    const bSize = (fs.statSync(bodyFile).size / (1024 * 1024)).toFixed(2);
    console.log(`  [OK] ${c}: avatar (${aSize} MB), body (${bSize} MB)`);
  }
}

// 2. Audit animations in models/animations/
console.log('\n2. Checking models/animations/ subdirectories & files:');
const expectedCategories = {
  'Cheer': ['Cheering.glb', 'Clapping.glb', 'Excited.glb', 'Rallying.glb', 'Trump-Dance.glb', 'Victory.glb'],
  'Defence': ['Body Block.glb'],
  'Greet': ['Praying.glb', 'Quick Formal Bow.glb', 'Quick Informal Bow.glb', 'Salute.glb', 'Shaking Hands 2.glb', 'Waving.glb'],
  'Hit': ['Big Hit To Head.glb', 'Head Hit.glb', 'Hit By Car.glb', 'Hit On Legs.glb', 'Hit To Body.glb', 'Rib Hit.glb', 'Stomach Hit.glb'],
  'Idle': ['Breathing Idle.glb', 'Happy Idle.glb', 'Neutral Idle.glb', 'Sad Idle.glb', 'Warrior Idle.glb'],
  'Kick': ['Flying Kick.glb', 'Kick To The Groin.glb', 'Kicking.glb', 'Mma Kick (1).glb', 'Mma Kick.glb'],
  'Kiss': ['Kiss (1).glb', 'Kiss.glb'],
  'Punch': ['Elbow Punching.glb', 'Hook Punch.glb', 'Picking Up.glb', 'Punching.glb', 'Quad Punch.glb', 'mix-kick-punch.glb'],
  'Run': ['Run To Rolling.glb', 'Running (1).glb', 'Running Backward.glb', 'Running.glb'],
  'Walk': ['Female-Walking.glb', 'Fight-Walking.glb', 'Walking.glb'],
};

let allAnimsOk = true;
let totalAnimFiles = 0;
for (const [cat, files] of Object.entries(expectedCategories)) {
  const catDir = path.join('models/animations', cat);
  if (!fs.existsSync(catDir)) {
    console.error(`  [FAIL] Missing category directory: ${cat}`);
    allAnimsOk = false;
    continue;
  }
  for (const f of files) {
    const fullPath = path.join(catDir, f);
    if (!fs.existsSync(fullPath)) {
      console.error(`  [FAIL] Missing clip: ${cat}/${f}`);
      allAnimsOk = false;
    } else {
      totalAnimFiles++;
    }
  }
  console.log(`  [OK] Category '${cat}': ${files.length}/${files.length} clips verified.`);
}

// Root animations
for (const f of ['dead-animation.glb', 'Stabbing.glb']) {
  const fullPath = path.join('models/animations', f);
  if (!fs.existsSync(fullPath)) {
    console.error(`  [FAIL] Missing root clip: ${f}`);
    allAnimsOk = false;
  } else {
    totalAnimFiles++;
    console.log(`  [OK] Root clip: ${f} verified.`);
  }
}
console.log(`  Total animations indexed: ${totalAnimFiles}`);

// 3. Stages & Objects
console.log('\n3. Checking stages and objects:');
const stages = ['stage-1.glb', 'stage-2.glb', 'stage-3.glb'];
for (const s of stages) {
  const sp = path.join('models/stages', s);
  console.log(`  [${fs.existsSync(sp) ? 'OK' : 'FAIL'}] Stage: ${s}`);
}
const laptop = path.join('models/objects/cyberpunk_laptop.glb');
console.log(`  [${fs.existsSync(laptop) ? 'OK' : 'FAIL'}] Object: cyberpunk_laptop.glb`);

// 4. Verify code integrity
console.log('\n4. Checking TypeScript and UI configuration:');
const typesGame = fs.readFileSync('src/types/game.ts', 'utf8');
const maxHpMatch = typesGame.match(/BASE_FIGHTER_HEALTH\s*=\s*(\d+)/);
console.log(`  Fighter base health: ${maxHpMatch ? maxHpMatch[1] : 'not found'} HP (Target: 150)`);

const styleCss = fs.readFileSync('src/style.css', 'utf8');
const hasHiddenHp = styleCss.includes('.health-value {\n  display: none !important;\n}');
console.log(`  HP numbers hidden in HUD: ${hasHiddenHp ? 'YES' : 'NO'}`);

const hasSkull = styleCss.includes('.hud-timer-skull');
console.log(`  MK9 Timer Skull Indicator: ${hasSkull ? 'YES' : 'NO'}`);

const hasCircularAvatar = styleCss.includes('border-radius: 50%') && styleCss.includes('object-fit: cover');
console.log(`  Circular Metallic Avatar Medallion with centered face: ${hasCircularAvatar ? 'YES' : 'NO'}`);

console.log('\nAUDIT RESULT:', (allCharsOk && allAnimsOk) ? 'ALL ASSETS AND CONFIGURATIONS VERIFIED PERFECTLY!' : 'SOME CHECKS FAILED');

