import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListProjectCommentsQueryDto extends PaginationQueryDto {}

export class ListAssignableMembersQueryDto extends PaginationQueryDto {}

export class ListProjectMembersQueryDto extends PaginationQueryDto {}
