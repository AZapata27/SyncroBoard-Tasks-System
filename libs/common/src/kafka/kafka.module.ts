import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaService } from './kafka.service';

export interface KafkaModuleOptions {
  clientId: string;
  groupId: string;
  brokers: string[];
}

@Module({})
export class KafkaModule {
  static register(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      // Registered once in each AppModule; global so feature modules such as OutboxModule
      // can inject KafkaService without re-registering the Kafka client.
      global: true,
      imports: [
        ClientsModule.register([
          {
            name: 'KAFKA_SERVICE',
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId: options.clientId,
                brokers: options.brokers,
              },
              consumer: {
                groupId: options.groupId,
                allowAutoTopicCreation: true,
              },
              producer: {
                allowAutoTopicCreation: true,
                idempotent: true,
                maxInFlightRequests: 5,
                transactionalId: `${options.clientId}-transactional`,
              },
            },
          },
        ]),
      ],
      providers: [KafkaService],
      exports: [KafkaService],
    };
  }
}
