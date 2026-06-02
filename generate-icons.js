/**
 * generate-icons.js
 *
 * Run with Node.js to generate the required PNG icons from an SVG source.
 * Requires the `sharp` package: npm install sharp
 *
 * Usage:
 *   node generate-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, 'icons');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// SVG bell icon (matches the GitHub bell aesthetic)
const svgTemplate = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
  <rect width="24" height="24" rx="5" fill="#24292f"/>
  <path fill="white" d="M12 3a6 6 0 0 1 6 6v1.5c0 .2.06.38.17.53l2.2 3.3A1.5 1.5 0 0 1 19.13 16H4.87a1.5 1.5 0 0 1-1.24-2.67l2.2-3.3A.75.75 0 0 0 6 9.5V9a6 6 0 0 1 6-6Zm0 16a2.5 2.5 0 0 0 2.36-1.69H9.64A2.5 2.5 0 0 0 12 19Z"/>
</svg>
`.trim();

(async () => {
  for (const size of SIZES) {
    const svg = Buffer.from(svgTemplate(size));
    const outPath = path.join(OUT_DIR, `icon${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(outPath);
    console.log(`✓ icons/icon${size}.png`);
  }
  console.log('\nDone! Icons written to ./icons/');
})();
