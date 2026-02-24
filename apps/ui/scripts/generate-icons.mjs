import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Navigate up from scripts/ to apps/ui/, then to public/
const uiDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(uiDir, 'public');
const iconsDir = path.resolve(publicDir, 'icons');
const sourceImage = path.resolve(publicDir, 'logo_larger.png');

console.log('UI directory:', uiDir);
console.log('Public directory:', publicDir);
console.log('Source image:', sourceImage);
console.log('Source image exists:', fs.existsSync(sourceImage));

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log('Generating PWA icons from logo_larger.png...');

    // Generate 192x192 icon
    await sharp(sourceImage)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      })
      .png()
      .toFile(path.resolve(iconsDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate 512x512 icon
    await sharp(sourceImage)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      })
      .png()
      .toFile(path.resolve(iconsDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // Generate 512x512 maskable icon
    await sharp(sourceImage)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      })
      .png()
      .toFile(path.resolve(iconsDir, 'icon-512-maskable.png'));
    console.log('✓ Generated icon-512-maskable.png');

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
