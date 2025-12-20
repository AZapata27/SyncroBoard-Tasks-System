import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class KafkaService {
  private readonly logger = new Logger(KafkaService.name);

  constructor(@Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.log('Kafka client connected successfully');
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
    this.logger.log('Kafka client disconnected');
  }

  async emit<T>(topic: string, message: T): Promise<void> {
    try {
      await this.kafkaClient.emit(topic, message).toPromise();
      this.logger.debug(`Event emitted to topic ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to emit event to topic ${topic}`, error);
      throw error;
    }
  }

  async send<T, R>(topic: string, message: T): Promise<R> {
    try {
      const response = await this.kafkaClient.send<R, T>(topic, message).toPromise();
      this.logger.debug(`Message sent to topic ${topic} and response received`);
      return response as R;
    } catch (error) {
      this.logger.error(`Failed to send message to topic ${topic}`, error);
      throw error;
    }
  }

  subscribeToResponseOf(topic: string): void {
    this.kafkaClient.subscribeToResponseOf(topic);
  }
}
