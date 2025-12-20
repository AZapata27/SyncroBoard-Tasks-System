import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@app/common';

@Entity('assignments')
@Index(['ticketId'])
@Index(['userId'])
export class Assignment extends BaseEntity {
  @Column({ name: 'ticket_id' })
  ticketId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'assigned_by_id' })
  assignedById: string;

  @Column({ name: 'assigned_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;
}
