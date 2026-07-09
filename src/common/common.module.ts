import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { ContentModerationService } from './services/content-moderation.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [ContentModerationService],
  exports: [ContentModerationService],
})
export class CommonModule {}
