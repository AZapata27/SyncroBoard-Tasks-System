import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { OutboxEvent } from '@app/common';
import { Assignment } from '@assignment/modules/assignments/assignment.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'syncro_assign_db',
  // Explicit list: the app is bundled with webpack, so a glob over __dirname finds no entity files.
  entities: [Assignment, OutboxEvent],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
