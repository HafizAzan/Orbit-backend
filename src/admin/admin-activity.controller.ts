import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AdminActivityService } from './admin-activity.service';
import {
  FlagAdminActivityDto,
  ListAdminActivityQueryDto,
} from './dto/admin-activity.dto';

@Controller('admin/activity')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminActivityController {
  constructor(private readonly adminActivityService: AdminActivityService) {}

  @Get()
  findAll(@Query() query: ListAdminActivityQueryDto) {
    return this.adminActivityService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.adminActivityService.getStats();
  }

  @Patch(':id/flag')
  flag(@Param('id') id: string, @Body() dto: FlagAdminActivityDto) {
    return this.adminActivityService.flag(id, dto);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.adminActivityService.resolve(id);
  }

  @Patch(':id/unflag')
  unflag(@Param('id') id: string) {
    return this.adminActivityService.unflag(id);
  }
}
