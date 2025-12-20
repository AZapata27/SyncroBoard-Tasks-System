import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@app/common';
import { Ticket } from '@ticket/modules/tickets/ticket.entity';

@Entity('projects')
export class Project extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  key: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @OneToMany(() => Ticket, (ticket) => ticket.project)
  tickets: Ticket[];
}
