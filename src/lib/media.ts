import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_SIGNATURES: Array<{
  mime: string;
  ext: string;
  check: (buf: Uint8Array) => boolean;
}> = [
  {
    mime: 'image/png',
    ext: 'png',
    check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    check: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: 'image/avif',
    ext: 'avif',
    check: (b) =>
      b.length >= 12 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70 &&
      b[8] === 0x61 &&
      b[9] === 0x76 &&
      b[10] === 0x69 &&
      b[11] === 0x66,
  },
];

export function detectAllowedImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  for (const sig of ALLOWED_IMAGE_SIGNATURES) {
    if (sig.check(bytes)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }
  return null;
}

export function sanitizeBaseFilename(original: string): string {
  const base = path.basename(original, path.extname(original));
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || 'image';
}

export async function saveUploadedImage(file: File): Promise<{
  filename: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
}> {
  if (file.size === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds maximum size limit of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const detected = detectAllowedImageType(buffer);
  if (!detected) {
    throw new Error('Unsupported or invalid image format. Allowed: PNG, JPEG, WebP, GIF, AVIF.');
  }

  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  }

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const subDir = path.join(env.UPLOAD_DIR, ym);
  fs.mkdirSync(subDir, { recursive: true });

  const cleanName = sanitizeBaseFilename(file.name);
  const uniqueSuffix = crypto.randomBytes(6).toString('hex');
  const storedFilename = `${cleanName}-${uniqueSuffix}.${detected.ext}`;
  const storageRelPath = `${ym}/${storedFilename}`;
  const fullPath = path.join(env.UPLOAD_DIR, storageRelPath);

  fs.writeFileSync(fullPath, buffer);

  return {
    filename: storedFilename,
    storagePath: storageRelPath,
    publicUrl: `/uploads/${storageRelPath}`,
    mimeType: detected.mime,
    sizeBytes: buffer.byteLength,
  };
}

export function removeUploadedFile(storagePath: string): void {
  const safePath = path.resolve(env.UPLOAD_DIR, storagePath);
  if (!safePath.startsWith(path.resolve(env.UPLOAD_DIR))) {
    throw new Error('Invalid storage path.');
  }
  if (fs.existsSync(safePath)) {
    fs.unlinkSync(safePath);
  }
}
