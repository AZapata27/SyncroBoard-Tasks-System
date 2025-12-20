import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@app/common';
import { Ticket } from '@ticket/modules/tickets/ticket.entity';

@Entity('comments')
@Index(['ticketId'])
export class Comment extends BaseEntity {
  @Column({ name: 'ticket_id' })
  ticketId: string;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;
}
