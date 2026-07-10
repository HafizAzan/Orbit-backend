import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { TASK_UPLOADS_ROOT } from '../tasks/task-attachment.storage';

export const MAX_BRANDING_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

function ensureDirectory(relativePath: string) {
  const directory = join(TASK_UPLOADS_ROOT, relativePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  return directory;
}

function imageFileFilter(
  _request: Express.Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    callback(
      new BadRequestException(
        'Only PNG, JPG, GIF, WEBP, or ICO files are allowed.',
      ),
      false,
    );
    return;
  }

  callback(null, true);
}

export const brandingUploadOptions = {
  limits: { fileSize: MAX_BRANDING_ASSET_BYTES },
  fileFilter: imageFileFilter,
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, ensureDirectory('branding'));
    },
    filename: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase() || '.png';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
};

export function buildBrandingAssetUrl(storedFileName: string) {
  return `/api/v1/uploads/branding/${storedFileName}`;
}

export const avatarUploadOptions = {
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: imageFileFilter,
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, ensureDirectory('avatars'));
    },
    filename: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase() || '.png';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
};

export function buildAvatarAssetUrl(storedFileName: string) {
  return `/api/v1/uploads/avatars/${storedFileName}`;
}
