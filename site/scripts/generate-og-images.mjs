import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, '..');
const imagesDir = path.resolve(siteDir, 'images');
const logoPath = path.resolve(__dirname, '../../apps/ui/public/protolabs-logo.svg');

// Ensure images directory exists
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log('Created images directory:', imagesDir);
}

// Page definitions with titles
const pages = [
  {
    name: 'main',
    title: 'protoLabs',
    subtitle: 'AI-Native Development Agency',
  },
  {
    name: 'consulting',
    title: 'setupLab',
    subtitle: 'protoLabs Consulting',
  },
  {
    name: 'roadmap',
    title: 'Roadmap',
    subtitle: 'protoLabs',
  },
  {
    name: 'changelog',
    title: 'Changelog',
    subtitle: 'protoLabs',
  },
  {
    name: 'report',
    title: 'setupLab Report',
    subtitle: 'protoLabs',
  },
];

async function generateOGImages() {
  try {
    console.log('Generating Open Graph images...\n');

    for (const page of pages) {
      const outputPath = path.resolve(imagesDir, `og-${page.name}.png`);

      // Create base canvas with dark background
      const canvas = sharp({
        create: {
          width: 1200,
          height: 630,
          channels: 4,
          background: { r: 9, g: 9, b: 11, alpha: 1 }, // #09090b
        },
      });

      // Create SVG overlay with text and logo
      const svgOverlay = `
        <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="accent-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#c4b5fd;stop-opacity:0.15" />
              <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:0.15" />
            </linearGradient>
            <linearGradient id="text-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#c4b5fd" />
              <stop offset="50%" style="stop-color:#818cf8" />
              <stop offset="100%" style="stop-color:#6366f1" />
            </linearGradient>
          </defs>

          <!-- Background gradient accent -->
          <rect width="1200" height="630" fill="url(#accent-gradient)" />

          <!-- Diamond logo (centered top) -->
          <g transform="translate(550, 120)">
            <rect width="100" height="100" rx="25" fill="url(#text-gradient)" />
            <path d="M50 20 L90 60 L50 100 L10 60 Z" fill="#FFFFFF" />
          </g>

          <!-- Title text -->
          <text
            x="600"
            y="300"
            font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
            font-size="72"
            font-weight="700"
            fill="#FFFFFF"
            text-anchor="middle"
            letter-spacing="-0.02em"
          >${page.title}</text>

          <!-- Subtitle text -->
          <text
            x="600"
            y="360"
            font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
            font-size="36"
            font-weight="400"
            fill="#a78bfa"
            text-anchor="middle"
            letter-spacing="-0.01em"
          >${page.subtitle}</text>

          <!-- Bottom accent line -->
          <rect x="400" y="560" width="400" height="3" rx="1.5" fill="url(#text-gradient)" opacity="0.6" />
        </svg>
      `;

      // Composite the SVG overlay onto the canvas and save
      await canvas
        .composite([
          {
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0,
          },
        ])
        .png({
          quality: 90,
          compressionLevel: 9,
          palette: true,
        })
        .toFile(outputPath);

      // Get file size
      const stats = fs.statSync(outputPath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);

      console.log(`✓ Generated og-${page.name}.png (${fileSizeKB} KB)`);
    }

    console.log('\n✅ All Open Graph images generated successfully!');
    console.log(`Output directory: ${imagesDir}`);
  } catch (error) {
    console.error('Error generating OG images:', error);
    process.exit(1);
  }
}

generateOGImages();
