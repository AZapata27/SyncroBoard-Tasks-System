import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../database';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export type EventPayload = Record<string, unknown>;

@Entity('outbox_events')
@Index(['status', 'createdAt'])
export class OutboxEvent extends BaseEntity {
  @Column({ name: 'aggregate_id' })
  aggregateId: string;

  @Column({ name: 'aggregate_type' })
  aggregateType: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: EventPayload;

  @Column({ name: 'kafka_topic' })
  kafkaTopic: string;

  @Column({
    type: 'enum',
    enum: OutboxStatus,
    default: OutboxStatus.PENDING,
  })
  status: OutboxStatus;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'last_error', nullable: true, type: 'text' })
  lastError: string | null;

  @Column({ name: 'processed_at', nullable: true, type: 'timestamp' })
  processedAt: Date | null;
}
