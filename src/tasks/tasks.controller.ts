import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { DashboardQueryDto, DashboardPeriod } from './dto/dashboard-query.dto';
import { ListTasksQueryDto } from './dto/task-list-query.dto';
import { taskAttachmentUploadOptions } from './task-attachment.storage';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.tasksService.getDashboard(
      user,
      query.period ?? DashboardPeriod.THIS_MONTH,
    );
  }

  @Get('reports')
  getReports(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getReports(user);
  }

  @Get('boards')
  listBoards(@CurrentUser() user: JwtPayload) {
    return this.tasksService.listBoards(user);
  }

  @Get('boards/:projectId')
  getBoard(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.tasksService.getBoard(user, projectId);
  }

  @Get('my')
  listMyTasks(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasksService.listMyTasks(user, query);
  }

  @Get()
  listTasks(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasksService.listTasks(user, query);
  }

  @Get(':taskId')
  getTask(@CurrentUser() user: JwtPayload, @Param('taskId') taskId: string) {
    return this.tasksService.getTask(user, taskId);
  }

  @Post()
  createTask(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(user, dto);
  }

  @Post(':taskId/attachments')
  @UseInterceptors(FileInterceptor('file', taskAttachmentUploadOptions))
  uploadAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tasksService.uploadAttachment(user, taskId, file);
  }

  @Patch(':taskId')
  updateTask(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(user, taskId, dto);
  }

  @Delete(':taskId/attachments/:attachmentId')
  deleteAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.tasksService.deleteAttachment(user, taskId, attachmentId);
  }

  @Delete(':taskId')
  deleteTask(@CurrentUser() user: JwtPayload, @Param('taskId') taskId: string) {
    return this.tasksService.deleteTask(user, taskId);
  }
}
