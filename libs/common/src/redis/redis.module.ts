import { DynamicModule, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

@Module({})
export class RedisModule {
  static register(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: 'REDIS_OPTIONS',
          useValue: options,
        },
        RedisService,
      ],
      exports: [RedisService],
    };
  }
}
