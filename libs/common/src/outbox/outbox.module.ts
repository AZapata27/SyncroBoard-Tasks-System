import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './outbox.entity';
import { OUTBOX_OPTIONS, outboxOptionsFromEnv } from './outbox.options';
import { OutboxScheduler } from './outbox.scheduler';
import { OutboxService } from './outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [
    { provide: OUTBOX_OPTIONS, useFactory: () => outboxOptionsFromEnv() },
    OutboxService,
    OutboxScheduler,
  ],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
