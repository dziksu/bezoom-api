import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './database/schema';

/**
 * Read-side database connection.
 * Connects to DATABASE_READ_URL if set, otherwise falls back to DATABASE_URL.
 * Used by all query handlers / read repositories.
 *
 * In production, point DATABASE_READ_URL at a read replica for horizontal
 * read scaling. In local dev, both point at the same Postgres instance.
 */
@Injectable()
export class DrizzleReadService implements OnModuleDestroy {
  private readonly logger = new Logger(DrizzleReadService.name);
  private readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService) {
    const readUrl =
      this.configService.get<string>('database.readUrl') ?? this.configService.get<string>('database.url');

    this.logger.log('Connecting to read database…');

    this.pool = new Pool({
      connectionString: readUrl,
      max: this.configService.get<number>('database.maxConnections', 10),
      ssl: this.configService.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : undefined
    });

    this.db = drizzle(this.pool, { schema });
    this.logger.log('Read database connection established');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Read database connection closed');
  }
}
