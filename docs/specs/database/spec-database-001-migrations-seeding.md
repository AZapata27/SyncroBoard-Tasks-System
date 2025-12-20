# 🗄️ SPEC-DATABASE-001: Migrations & Seeding
## Database Schema Management with TypeORM

**Versión:** 1.0.0
**Última Actualización:** 2025-12-20
**Estado:** Draft

---

## 1. Migration Strategy

### 1.1 TypeORM Configuration

```typescript
// apps/auth-service/src/database/typeorm.config.ts

import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // NEVER true in production
  logging: process.env.NODE_ENV === 'development',
  migrationsRun: false, // Run manually or via script
};

export const dataSource = new DataSource(dataSourceOptions);
```

### 1.2 Migration Scripts

```json
// apps/auth-service/package.json

{
  "scripts": {
    "migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/database/typeorm.config.ts src/database/migrations/$npm_config_name",
    "migration:create": "typeorm-ts-node-commonjs migration:create src/database/migrations/$npm_config_name",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d src/database/typeorm.config.ts",
    "migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/database/typeorm.config.ts",
    "migration:show": "typeorm-ts-node-commonjs migration:show -d src/database/typeorm.config.ts"
  }
}
```

### 1.3 Example Migration

```typescript
// apps/auth-service/src/database/migrations/1703001-CreateUsersTable.ts

import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUsersTable1703001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'enum',
            enum: ['LOCAL', 'GOOGLE'],
            default: "'LOCAL'",
          },
          {
            name: 'first_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'last_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'avatar_url',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    // Create index on email
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_email',
        columnNames: ['email'],
      })
    );

    // Create index on provider
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_provider',
        columnNames: ['provider'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
```

---

## 2. Seeding Strategy

### 2.1 Seeder Service

```typescript
// libs/common/src/database/seeding/seeder.service.ts

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SeederService {
  constructor(private dataSource: DataSource) {}

  async seed() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.seedUsers(queryRunner);
      await this.seedProjects(queryRunner);
      await this.seedTickets(queryRunner);

      await queryRunner.commitTransaction();
      console.log('✅ Database seeded successfully');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async seedUsers(queryRunner: any) {
    // Implementation
  }

  private async seedProjects(queryRunner: any) {
    // Implementation
  }

  private async seedTickets(queryRunner: any) {
    // Implementation
  }
}
```

### 2.2 Seed Data Files

```typescript
// apps/auth-service/src/database/seeds/users.seed.ts

export const usersSeedData = [
  {
    email: 'admin@syncroboard.com',
    firstName: 'Admin',
    lastName: 'User',
    provider: 'LOCAL',
    roles: ['ADMIN'],
  },
  {
    email: 'pm@syncroboard.com',
    firstName: 'Project',
    lastName: 'Manager',
    provider: 'LOCAL',
    roles: ['PROJECT_MANAGER'],
  },
  // ... more seed data
];
```

---

## 3. Backup & Restore

### 3.1 Automated Backup Script

```bash
#!/bin/bash
# scripts/backup-databases.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/$DATE"

mkdir -p $BACKUP_DIR

# Backup Auth DB
pg_dump $AUTH_DATABASE_URL > $BACKUP_DIR/auth_db.sql

# Backup Ticket DB
pg_dump $TICKET_DATABASE_URL > $BACKUP_DIR/ticket_db.sql

# Backup Assignment DB
pg_dump $ASSIGNMENT_DATABASE_URL > $BACKUP_DIR/assignment_db.sql

# Compress
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

# Upload to S3
aws s3 cp $BACKUP_DIR.tar.gz s3://syncroboard-backups/

echo "✅ Backup complete: $BACKUP_DIR.tar.gz"
```

---

**Changelog:**

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-20 | Especificación inicial |
