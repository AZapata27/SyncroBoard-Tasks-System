import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { OutboxEvent } from '@app/common';
import { Comment } from '@ticket/modules/comments/comment.entity';
import { Project } from '@ticket/modules/projects/project.entity';
import { Ticket } from '@ticket/modules/tickets/ticket.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'syncro_ticket_db',
  // Explicit list: the app is bundled with webpack, so a glob over __dirname finds no entity files.
  entities: [Ticket, Comment, Project, OutboxEvent],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
