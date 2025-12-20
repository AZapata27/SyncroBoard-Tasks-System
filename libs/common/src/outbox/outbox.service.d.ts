import { Repository } from 'typeorm';
import { OutboxEvent, EventPayload } from './outbox.entity';
import { KafkaService } from '../kafka';
export interface CreateOutboxEventParams {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: EventPayload;
    kafkaTopic: string;
}
export declare class OutboxService {
    private readonly outboxRepository;
    private readonly kafkaService;
    private readonly logger;
    private readonly MAX_RETRIES;
    constructor(outboxRepository: Repository<OutboxEvent>, kafkaService: KafkaService);
    /**
     * Creates an outbox event within a transaction
     * This ensures atomicity between business operation and event creation
     */
    createOutboxEvent(params: CreateOutboxEventParams): Promise<OutboxEvent>;
    /**
     * Processes pending outbox events and publishes them to Kafka
     * Should be called periodically by a scheduled job
     */
    processPendingEvents(): Promise<void>;
    private processEvent;
    /**
     * Retries failed events that haven't exceeded max retry count
     */
    retryFailedEvents(): Promise<void>;
    /**
     * Cleanup old processed events
     */
    cleanupOldEvents(daysOld?: number): Promise<void>;
}
