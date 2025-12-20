import { ClientKafka } from '@nestjs/microservices';
export declare class KafkaService {
    private readonly kafkaClient;
    private readonly logger;
    constructor(kafkaClient: ClientKafka);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    emit<T>(topic: string, message: T): Promise<void>;
    send<T, R>(topic: string, message: T): Promise<R>;
    subscribeToResponseOf(topic: string): void;
}
