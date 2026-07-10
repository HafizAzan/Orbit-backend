import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { brandingUploadOptions } from '../common/asset-upload.storage';
import { AdminSettingsService } from './admin-settings.service';
import { UpdatePlatformSettingsDto } from './dto/admin-settings.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @Get()
  getSettings() {
    return this.adminSettingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.adminSettingsService.updateSettings(dto);
  }

  @Post('branding/logo')
  @UseInterceptors(FileInterceptor('file', brandingUploadOptions))
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Logo file is required.');
    }
    return this.adminSettingsService.uploadBrandingAsset('logo', file);
  }

  @Post('branding/favicon')
  @UseInterceptors(FileInterceptor('file', brandingUploadOptions))
  uploadFavicon(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Favicon file is required.');
    }
    return this.adminSettingsService.uploadBrandingAsset('favicon', file);
  }
}
