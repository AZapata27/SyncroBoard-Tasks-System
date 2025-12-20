import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '@app/common';
import { TicketType, TicketPriority, TicketStatus } from '@app/contracts';
import { Project } from '@ticket/modules/projects/project.entity';
import { Comment } from '@ticket/modules/comments/comment.entity';

@Entity('tickets')
@Index(['projectId', 'status'])
@Index(['reporterId'])
export class Ticket extends BaseEntity {
  @Column({ name: 'project_id' })
  projectId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: TicketType,
  })
  type: TicketType;

  @Column({
    type: 'enum',
    enum: TicketPriority,
  })
  priority: TicketPriority;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.TODO,
  })
  status: TicketStatus;

  @Column({ name: 'reporter_id' })
  reporterId: string;

  @Column({ name: 'estimated_hours', type: 'float', nullable: true })
  estimatedHours: number | null;

  @Column({ name: 'sprint_id', nullable: true })
  sprintId: string | null;

  @Column({ name: 'parent_ticket_id', nullable: true })
  parentTicketId: string | null;

  @ManyToOne(() => Project, (project) => project.tickets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToMany(() => Comment, (comment) => comment.ticket)
  comments: Comment[];
}
