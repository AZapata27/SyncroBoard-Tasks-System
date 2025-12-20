import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create microservice for Kafka consumer
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID || 'notification-service-group',
        allowAutoTopicCreation: true,
      },
    },
  });

  await app.listen();

  logger.log('🚀 Notification Service (Kafka Consumer) is running');
  logger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`📨 Consuming from Kafka brokers: ${process.env.KAFKA_BROKERS || 'localhost:9092'}`);
}

bootstrap();
