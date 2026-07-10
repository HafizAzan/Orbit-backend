import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AdminApiKeysService } from './admin-api-keys.service';
import {
  CreatePlatformApiKeyDto,
  UpdatePlatformApiKeyDto,
} from './dto/admin-api-keys.dto';

@Controller('admin/api-keys')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminApiKeysController {
  constructor(private readonly adminApiKeysService: AdminApiKeysService) {}

  @Get()
  list() {
    return this.adminApiKeysService.list();
  }

  @Post()
  create(@Body() dto: CreatePlatformApiKeyDto) {
    return this.adminApiKeysService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformApiKeyDto) {
    return this.adminApiKeysService.update(id, dto);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.adminApiKeysService.revoke(id);
  }
}
