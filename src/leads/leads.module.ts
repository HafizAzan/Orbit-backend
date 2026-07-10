import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactLead } from '../entities/contact-lead.entity';
import { EmailModule } from '../email/email.module';
import {
  AdminLeadsController,
  PublicLeadsController,
} from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContactLead]), EmailModule],
  controllers: [PublicLeadsController, AdminLeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
