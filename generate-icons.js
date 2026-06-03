/**
 * generate-icons.js
 *
 * Generates the required PNG icon sizes from a single source image.
 * Requires the `sharp` package: npm install sharp
 *
 * Usage:
 *   1. Save your icon artwork as `icon-source.png` in the project root
 *      (a square image works best — 512×512 or 1024×1024).
 *   2. node generate-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, 'icons');
const SOURCE = path.join(__dirname, 'icon-source.png');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

if (!fs.existsSync(SOURCE)) {
  console.error(
    `Source image not found: ${SOURCE}\n` +
      'Save your icon artwork as icon-source.png in the project root, then re-run.',
  );
  process.exit(1);
}

(async () => {
  for (const size of SIZES) {
    const outPath = path.join(OUT_DIR, `icon${size}.png`);
    await sharp(SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // keep transparency
      })
      .png()
      .toFile(outPath);
    console.log(`✓ icons/icon${size}.png`);
  }
  console.log('\nDone! Icons written to ./icons/');
})();
