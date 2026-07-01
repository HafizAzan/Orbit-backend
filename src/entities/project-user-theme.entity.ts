import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectTheme } from '../enum/project.enum';
import { Project } from './project.entity';
import { User } from './user.entity';

@Entity('project_user_themes')
@Unique(['userId', 'projectId'])
export class ProjectUserTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({
    type: 'enum',
    enum: ProjectTheme,
    default: ProjectTheme.CLASSIC,
  })
  theme: ProjectTheme;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
