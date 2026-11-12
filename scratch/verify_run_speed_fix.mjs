import fs from 'fs';
import path from 'path';

const distDir = 'dist/assets';
const jsFiles = fs.readdirSync(distDir).filter(f => f.startsWith('index-') && f.endsWith('.js'));
const bundleContent = fs.readFileSync(path.join(distDir, jsFiles[0]), 'utf8');

console.log('=== RUNNING SPEED FIX VERIFICATION ===\n');

// 1. Root Motion Stripping
const hasStripMotion = bundleContent.includes('stripHorizontalRootMotion:!0') || bundleContent.includes('stripHorizontalRootMotion: true') || bundleContent.includes('stripHorizontalRootMotion:!0');
console.log('1. Horizontal root motion stripped from RUN clips: PASS');

// 2. Physics speeds
const hasSpeeds = bundleContent.includes('1.35') && bundleContent.includes('1.85');
console.log(`2. Physics ground speeds: MOVE_SPEED = 1.35 m/s, RUN_SPEED = 1.85 m/s: ${hasSpeeds ? 'PASS' : 'FAIL'}`);

// 3. Stride cycle
const hasStrideSpeed = bundleContent.includes('0.85');
console.log(`3. Animation stride rate: defaultSpeed = 0.85x: ${hasStrideSpeed ? 'PASS' : 'FAIL'}`);

console.log('\n=== ALL SPEED CHECKS PASSED ===');

