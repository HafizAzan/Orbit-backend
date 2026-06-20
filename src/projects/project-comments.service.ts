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

    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        projectId,
        authorId: user.sub,
        body: dto.body.trim(),
      }),
    );

    await this.projectRepository.increment({ id: projectId }, 'commentCount', 1);

    const saved = await this.commentRepository.findOne({
      where: { id: comment.id },
      relations: { author: true },
    });

    if (!saved) {
      throw new NotFoundException('Comment not found.');
    }

    return mapProjectCommentResponse(saved);
  }

  async deleteComment(
    user: JwtPayload,
    projectId: string,
    commentId: string,
  ) {
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
    await this.projectRepository.decrement({ id: projectId }, 'commentCount', 1);

    return {
      message: 'Comment deleted.',
    };
  }
}
