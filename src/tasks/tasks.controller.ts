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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.tasksService.getDashboard(user);
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
  listMyTasks(@CurrentUser() user: JwtPayload) {
    return this.tasksService.listMyTasks(user);
  }

  @Get()
  listTasks(@CurrentUser() user: JwtPayload) {
    return this.tasksService.listTasks(user);
  }

  @Get(':taskId')
  getTask(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.getTask(user, taskId);
  }

  @Post()
  createTask(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(user, dto);
  }

  @Patch(':taskId')
  updateTask(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(user, taskId, dto);
  }

  @Delete(':taskId')
  deleteTask(
    @CurrentUser() user: JwtPayload,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.deleteTask(user, taskId);
  }
}
