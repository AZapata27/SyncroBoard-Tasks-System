import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisModuleOptions } from './redis.module';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly options;
    private readonly logger;
    private client;
    constructor(options: RedisModuleOptions);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getClient(): Redis;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    setObject<T>(key: string, value: T, ttl?: number): Promise<void>;
    getObject<T>(key: string): Promise<T | null>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    expire(key: string, seconds: number): Promise<void>;
    ttl(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    flushdb(): Promise<void>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
}
