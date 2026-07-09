import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../database/schema';

/**
 * Write-side database connection.
 * Connects to DATABASE_URL (primary).
 * Used by all command handlers / write repositories.
 */
@Injectable()
export class DrizzleWriteService implements OnModuleDestroy {
  private readonly logger = new Logger(DrizzleWriteService.name);
  private readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('database.url');
    this.logger.log('Connecting to write database…');

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: this.configService.get<number>('database.maxConnections', 10),
      ssl: this.configService.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : undefined
    });

    this.db = drizzle(this.pool, { schema });
    this.logger.log('Write database connection established');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Write database connection closed');
  }
}
