import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import {
  CreateContactLeadDto,
  ListContactLeadsQueryDto,
  UpdateContactLeadStatusDto,
} from './dto/leads.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateContactLeadDto) {
    return this.leadsService.create(dto);
  }
}

@Controller('admin/leads')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll(@Query() query: ListContactLeadsQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateContactLeadStatusDto,
  ) {
    const result = await this.leadsService.updateStatus(id, dto);
    if (!result) {
      throw new NotFoundException('Lead not found.');
    }
    return result;
  }
}
