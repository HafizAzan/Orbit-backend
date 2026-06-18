import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

export const TASK_UPLOADS_ROOT = join(process.cwd(), 'uploads');
export const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
]);

export function getTaskAttachmentAbsolutePath(storageKey: string) {
  return join(TASK_UPLOADS_ROOT, storageKey);
}

export function ensureTaskUploadDirectory(taskId: string) {
  const directory = join(TASK_UPLOADS_ROOT, 'tasks', taskId);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  return directory;
}

export const taskAttachmentUploadOptions = {
  limits: { fileSize: MAX_TASK_ATTACHMENT_BYTES },
  fileFilter: (
    _request: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(
        new BadRequestException('Only PNG, JPG, and PDF files are allowed.'),
        false,
      );
      return;
    }

    callback(null, true);
  },
  storage: diskStorage({
    destination: (request, _file, callback) => {
      const taskId = String(request.params.taskId);
      callback(null, ensureTaskUploadDirectory(taskId));
    },
    filename: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
};

export function buildTaskAttachmentStorageKey(taskId: string, storedFileName: string) {
  return join('tasks', taskId, storedFileName).replace(/\\/g, '/');
}
