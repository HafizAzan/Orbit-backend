import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../common/dto/pagination-query.dto';
import { ContactLead } from '../entities/contact-lead.entity';
import { EmailService } from '../email/email.service';
import {
  CreateContactLeadDto,
  ListContactLeadsQueryDto,
  UpdateContactLeadStatusDto,
} from './dto/leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(ContactLead)
    private readonly leadRepository: Repository<ContactLead>,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactLeadDto) {
    const lead = await this.leadRepository.save(
      this.leadRepository.create({
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        companyName: dto.companyName?.trim() || null,
        subject: dto.subject,
        message: dto.message.trim(),
        source: dto.source?.trim() || 'contact',
        status: 'new',
      }),
    );

    void this.emailService
      .sendContactLeadNotification({
        fullName: lead.fullName,
        email: lead.email,
        companyName: lead.companyName,
        subject: lead.subject,
        message: lead.message,
        source: lead.source,
      })
      .catch(() => undefined);

    return {
      message: 'Thanks for reaching out. Our team will get back to you soon.',
      id: lead.id,
    };
  }

  async findAll(query: ListContactLeadsQueryDto = {}) {
    const { page, limit, skip, take } = resolvePagination(query);
    const where = query.status ? { status: query.status } : {};

    const [rows, total] = await this.leadRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return buildPaginatedResponse(
      rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        companyName: row.companyName,
        subject: row.subject,
        message: row.message,
        status: row.status,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    );
  }

  async updateStatus(id: string, dto: UpdateContactLeadStatusDto) {
    const lead = await this.leadRepository.findOne({ where: { id } });
    if (!lead) {
      return null;
    }

    lead.status = dto.status;
    await this.leadRepository.save(lead);
    return {
      id: lead.id,
      status: lead.status,
    };
  }
}
