import { DynamicModule } from '@nestjs/common';
export interface RedisModuleOptions {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
}
export declare class RedisModule {
    static register(options: RedisModuleOptions): DynamicModule;
}
