import { BaseEntity } from '../database';
export declare enum OutboxStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    SENT = "SENT",
    FAILED = "FAILED"
}
export type EventPayload = Record<string, unknown>;
export declare class OutboxEvent extends BaseEntity {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: EventPayload;
    kafkaTopic: string;
    status: OutboxStatus;
    retryCount: number;
    lastError: string | null;
    processedAt: Date | null;
}
