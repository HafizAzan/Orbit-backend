import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { CalendarService } from './calendar.service';
import {
  CreateCalendarEventDto,
  ListCalendarEventsQueryDto,
  ListCalendarProjectsQueryDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  listEvents(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCalendarEventsQueryDto,
  ) {
    return this.calendarService.listEvents(user, query);
  }

  @Get('projects')
  listProjectSummaries(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListCalendarProjectsQueryDto,
  ) {
    return this.calendarService.getProjectSummaries(user, query);
  }

  @Post('events')
  createEvent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(user, dto);
  }

  @Patch('events/:eventId')
  updateEvent(
    @CurrentUser() user: JwtPayload,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(user, eventId, dto);
  }

  @Delete('events/:eventId')
  deleteEvent(
    @CurrentUser() user: JwtPayload,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.deleteEvent(user, eventId);
  }
}
