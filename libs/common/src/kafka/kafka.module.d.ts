import { DynamicModule } from '@nestjs/common';
export interface KafkaModuleOptions {
    clientId: string;
    groupId: string;
    brokers: string[];
}
export declare class KafkaModule {
    static register(options: KafkaModuleOptions): DynamicModule;
}
