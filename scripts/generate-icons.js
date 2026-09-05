import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Soft Ambient Drop Shadow for Floating 3D Badge on White -->
    <filter id="markShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.14"/>
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.08"/>
    </filter>

    <!-- 'P' Frame Charcoal Gradient -->
    <linearGradient id="pBodyGrad" x1="15%" y1="10%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="#242b38"/>
      <stop offset="50%" stop-color="#181d26"/>
      <stop offset="100%" stop-color="#0d1017"/>
    </linearGradient>

    <!-- Emerald Jade Accent Gradient -->
    <linearGradient id="pJadeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <!-- Folded 3D Paper Curl Gradient -->
    <linearGradient id="pCurlGrad" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#6ee7b7"/>
      <stop offset="45%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>

    <!-- Curl Shadow -->
    <filter id="pCurlShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="-3" dy="5" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>

    <!-- Paper Subtle Border -->
    <filter id="paperShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- 100% Solid White Canvas (Eliminates Android / Samsung dark background fallback) -->
  <rect width="512" height="512" fill="#FFFFFF"/>

  <!-- Centered Logo Mark with Safe Zone Padding (Scale 0.65, perfectly centered at 256, 256) -->
  <g transform="translate(256, 256) scale(0.65) translate(-272, -236)" filter="url(#markShadow)">
    <!-- Outer 'P' Letter Frame -->
    <path
      d="M 160 416 C 114 416 88 390 88 344 L 88 168 C 88 96 136 56 220 56 L 320 56 C 408 56 456 104 456 192 L 456 244 C 456 332 408 380 320 380 L 264 380 C 258 380 252 384 250 390 C 244 406 236 416 216 416 Z"
      fill="url(#pBodyGrad)"
      stroke="rgba(0, 0, 0, 0.08)"
      stroke-width="4"
      stroke-linejoin="round"
    />

    <!-- Inner White Paper Document -->
    <path
      d="M 160 416 L 160 178 C 160 138 184 114 224 114 L 324 114 C 348 114 366 132 366 156 L 366 266 C 366 278 358 296 344 314 L 254 410 C 248 416 238 416 230 416 Z"
      fill="#FFFFFF"
      filter="url(#paperShadow)"
    />

    <!-- Text Lines on Document -->
    <rect x="200" y="192" width="112" height="22" rx="11" fill="#1b1e26"/>
    <rect x="200" y="234" width="62" height="22" rx="11" fill="url(#pJadeGrad)"/>

    <!-- Folded Corner (Curl / Peel) -->
    <path
      d="M 366 266 C 366 312 338 350 286 372 C 264 382 246 398 234 416 C 248 382 278 350 316 332 C 346 320 362 296 366 266 Z"
      fill="url(#pCurlGrad)"
      filter="url(#pCurlShadow)"
    />
  </g>
</svg>`;

async function run() {
  const svgBuffer = Buffer.from(svgContent);

  // 1. Save favicon.svg and SVG variants with white background and centered safe-zone mark
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.svg'), svgContent, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.svg'), svgContent, 'utf-8');
  console.log('Saved SVG files');

  // 2. Generate 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 3. Generate 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 4. Generate Apple Touch Icon 180x180 PNG
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 5. Generate Maskable Icon 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));
  console.log('Generated maskable-icon-512x512.png');
}

run().catch(console.error);
