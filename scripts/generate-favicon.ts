import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Design: Brass & Slate Monograph
// Colors:
// Obsidian: #222831
// Graphite: #393E46
// Brass: #FFD369
// Chalk: #EEEEEE

export const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a323d"/>
      <stop offset="100%" stop-color="#1e232b"/>
    </linearGradient>
    <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE08A"/>
      <stop offset="100%" stop-color="#F5C042"/>
    </linearGradient>
    <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Base Squircle -->
  <rect x="20" y="20" width="472" height="472" rx="108" fill="url(#bgGrad)" stroke="#393E46" stroke-width="12" filter="url(#subtleGlow)"/>
  
  <!-- Subtle Architectural Accent Rim -->
  <rect x="34" y="34" width="444" height="444" rx="94" fill="none" stroke="#FFD369" stroke-width="3" stroke-opacity="0.3"/>

  <!-- Monogram P -->
  <g id="monogram">
    <!-- Vertical Stem -->
    <rect x="136" y="116" width="56" height="280" rx="14" fill="url(#brassGrad)"/>

    <!-- P Loop / Bowl -->
    <path d="M 176 116 
             L 292 116 
             C 356 116 384 148 384 196 
             C 384 244 356 276 292 276 
             L 176 276 
             Z" 
          fill="url(#brassGrad)"/>

    <!-- Inner Counter -->
    <path d="M 192 168 
             L 282 168 
             C 318 168 332 180 332 196 
             C 332 212 318 224 282 224 
             L 192 224 
             Z" 
          fill="#222831"/>

    <!-- Terminal Prompt Chevron > in negative space under the bowl -->
    <path d="M 230 326 L 268 356 L 230 386" 
          stroke="url(#brassGrad)" 
          stroke-width="18" 
          stroke-linecap="round" 
          stroke-linejoin="round" 
          fill="none"/>

    <!-- Terminal Cursor _ -->
    <rect x="296" y="378" width="52" height="12" rx="6" fill="#EEEEEE" opacity="0.9"/>
  </g>
</svg>`;

async function main() {
  const publicDir = path.resolve(process.cwd(), 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  // 1. Write favicon.svg
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgFavicon, 'utf8');
  console.log('✓ Created public/favicon.svg');

  // 2. Generate PNGs
  const svgBuffer = Buffer.from(svgFavicon);
  
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  const png180 = await sharp(svgBuffer).resize(180, 180).png().toBuffer();
  const png192 = await sharp(svgBuffer).resize(192, 192).png().toBuffer();
  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();

  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32x32.png'));
  await sharp(svgBuffer).resize(16, 16).png().toFile(path.join(publicDir, 'favicon-16x16.png'));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ Created PNG assets: favicon-16x16, favicon-32x32, apple-touch-icon, icon-192, icon-512');

  // 3. Generate multi-resolution favicon.ico containing 16x16, 32x32, 48x48
  const icoBuffer = createIco([
    { width: 16, height: 16, data: png16 },
    { width: 32, height: 32, data: png32 },
    { width: 48, height: 48, data: png48 },
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('✓ Created multi-resolution public/favicon.ico (16, 32, 48px)');
}

function createIco(images: Array<{ width: number; height: number; data: Buffer }>): Buffer {
  const numImages = images.length;
  const headerSize = 6;
  const directorySize = numImages * 16;
  let currentOffset = headerSize + directorySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const directoryEntries: Buffer[] = [];
  const imageBuffers: Buffer[] = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.data.length, 8); // Image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // Offset to image data

    directoryEntries.push(entry);
    imageBuffers.push(img.data);
    currentOffset += img.data.length;
  }

  return Buffer.concat([header, ...directoryEntries, ...imageBuffers]);
}

main().catch((err) => {
  console.error('Error creating favicon:', err);
  process.exit(1);
});
