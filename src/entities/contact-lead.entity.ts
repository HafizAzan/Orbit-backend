import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ContactLeadSubject =
  | 'general'
  | 'support'
  | 'sales'
  | 'partnership'
  | 'billing'
  | 'enterprise';

export type ContactLeadStatus = 'new' | 'reviewed' | 'closed';

@Entity('contact_leads')
export class ContactLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'company_name', type: 'varchar', length: 160, nullable: true })
  companyName: string | null;

  @Column({ length: 40 })
  subject: ContactLeadSubject;

  @Column({ type: 'text' })
  message: string;

  @Column({ length: 20, default: 'new' })
  status: ContactLeadStatus;

  @Column({ name: 'source', length: 40, default: 'contact' })
  source: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
