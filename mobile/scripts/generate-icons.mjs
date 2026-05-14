import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

// SVG: white clock on black background
function clockSvg(size, padding = 0.15) {
  const bg = size;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * (1 - padding);
  const stroke = size * 0.045;
  const hourLen = r * 0.5;
  const minLen = r * 0.72;
  const tickOuter = r;
  const tickInner = r * 0.87;

  // 12 tick marks
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 * Math.PI) / 180;
    const x1 = cx + tickInner * Math.sin(angle);
    const y1 = cy - tickInner * Math.cos(angle);
    const x2 = cx + tickOuter * Math.sin(angle);
    const y2 = cy - tickOuter * Math.cos(angle);
    const w = i % 3 === 0 ? stroke * 1.2 : stroke * 0.6;
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="${w}" stroke-linecap="round"/>`;
  }

  // Hour hand at ~10:10 position (classic watch pose)
  const hourAngle = (-60 * Math.PI) / 180;
  const hx = cx + hourLen * Math.sin(hourAngle);
  const hy = cy - hourLen * Math.cos(hourAngle);

  const minAngle = (60 * Math.PI) / 180;
  const mx = cx + minLen * Math.sin(minAngle);
  const my = cy - minLen * Math.cos(minAngle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bg}" height="${bg}">
    <rect width="${bg}" height="${bg}" fill="black"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-width="${stroke}"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="white" stroke-width="${stroke * 1.4}" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${stroke * 0.8}" fill="white"/>
  </svg>`;
}

async function generate(svgStr, outPath, size) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}x${size})`);
}

await generate(clockSvg(1024), join(assetsDir, 'icon.png'), 1024);
await generate(clockSvg(1024), join(assetsDir, 'adaptive-icon.png'), 1024);
await generate(clockSvg(512), join(assetsDir, 'splash-icon.png'), 512);
await generate(clockSvg(64, 0.1), join(assetsDir, 'favicon.png'), 64);

console.log('All icons generated.');
