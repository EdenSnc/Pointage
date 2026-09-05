import sharp from 'sharp';

async function testMasks() {
  // 1. Squircle mask (Samsung One UI style: round rect rx=115 on dark phone wallpaper)
  const squircleMask = Buffer.from('<svg width="512" height="512"><rect width="512" height="512" rx="115" fill="#fff"/></svg>');
  
  // Create squircle on dark background (to simulate phone home screen)
  const squircleIcon = await sharp('public/pwa-512x512.png')
    .composite([{ input: squircleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const phoneWallpaper = Buffer.from('<svg width="600" height="600"><rect width="600" height="600" fill="#1e293b"/></svg>');
  await sharp(phoneWallpaper)
    .composite([{ input: squircleIcon, left: 44, top: 44 }])
    .png()
    .toFile('C:/Users/Admin/.gemini/antigravity-ide/brain/80ee1aad-4c4e-4dfb-97fc-57675a68117b/samsung_oneui_homescreen_preview.png');
    
  // 2. Circle mask (Standard Android)
  const circleMask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="230" fill="#fff"/></svg>');
  const circleIcon = await sharp('public/pwa-512x512.png')
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  await sharp(phoneWallpaper)
    .composite([{ input: circleIcon, left: 44, top: 44 }])
    .png()
    .toFile('C:/Users/Admin/.gemini/antigravity-ide/brain/80ee1aad-4c4e-4dfb-97fc-57675a68117b/android_circle_homescreen_preview.png');

  console.log('Generated Android preview masks successfully');
}

testMasks().catch(console.error);
