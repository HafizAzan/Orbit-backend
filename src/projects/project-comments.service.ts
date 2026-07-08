import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  mapProjectCommentResponse,
  type ProjectCommentResponse,
} from '../common/mappers/project-comment.mapper';
import { ProjectComment } from '../entities/project-comment.entity';
import { Project } from '../entities/project.entity';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../common/dto/pagination-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateProjectCommentDto } from './dto/project-comment.dto';
import { ListProjectCommentsQueryDto } from './dto/project-list-query.dto';
import { ProjectsService } from './projects.service';

@Injectable()
export class ProjectCommentsService {
  constructor(
    @InjectRepository(ProjectComment)
    private readonly commentRepository: Repository<ProjectComment>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly projectsService: ProjectsService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listComments(
    user: JwtPayload,
    projectId: string,
    query: ListProjectCommentsQueryDto = {},
  ) {
    await this.projectsService.ensureAccessibleProject(user, projectId);

    const { page, limit, skip, take } = resolvePagination(query);
    const [comments, total] = await this.commentRepository.findAndCount({
      where: { projectId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
      skip,
      take,
    });

    return buildPaginatedResponse(
      comments.map(mapProjectCommentResponse),
      total,
      page,
      limit,
    );
  }

  async createComment(
    user: JwtPayload,
    projectId: string,
    dto: CreateProjectCommentDto,
  ): Promise<ProjectCommentResponse> {
    await this.projectsService.ensureAccessibleProject(user, projectId, true);

    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { members: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        projectId,
        authorId: user.sub,
        body: dto.body.trim(),
      }),
    );

    await this.projectRepository.increment(
      { id: projectId },
      'commentCount',
      1,
    );

    const saved = await this.commentRepository.findOne({
      where: { id: comment.id },
      relations: { author: true },
    });

    if (!saved) {
      throw new NotFoundException('Comment not found.');
    }

    const response = mapProjectCommentResponse(saved);

    this.realtimeService.emitToProject(projectId, 'project:comment:created', {
      projectId,
      comment: response,
    });

    const memberUserIds = (project.members ?? []).map(
      (member) => member.userId,
    );
    const authorName = saved.author?.fullName ?? 'Someone';
    const preview =
      response.message.length > 80
        ? `${response.message.slice(0, 80)}…`
        : response.message;

    void this.notificationsService.notifyProjectMembers({
      organizationId: project.organizationId,
      projectId,
      projectName: project.name,
      actorUserId: user.sub,
      memberUserIds,
      title: 'New project comment',
      message: `${authorName} commented on ${project.name}: "${preview}"`,
      href: `/projects/${projectId}`,
    });

    return response;
  }

  async deleteComment(user: JwtPayload, projectId: string, commentId: string) {
    await this.projectsService.ensureAccessibleProject(user, projectId, true);

    const comment = await this.commentRepository.findOne({
      where: { id: commentId, projectId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }

    if (comment.authorId !== user.sub) {
      throw new ForbiddenException('You can only delete your own comments.');
    }

    await this.commentRepository.delete(comment.id);
    await this.projectRepository.decrement(
      { id: projectId },
      'commentCount',
      1,
    );

    this.realtimeService.emitToProject(projectId, 'project:comment:deleted', {
      projectId,
      commentId,
    });

    return {
      message: 'Comment deleted.',
    };
  }
}
