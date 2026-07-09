import { Module, Global } from '@nestjs/common';
import { DrizzleWriteService } from './drizzle-write.service';
import { DrizzleReadService } from './drizzle-read.service';

/**
 * Global module providing read and write Drizzle database connections.
 *
 * The old `DrizzleService` is kept as an alias for backward compatibility
 * during the migration. It resolves to the write connection.
 */
@Global()
@Module({
  providers: [
    DrizzleWriteService,
    DrizzleReadService,
    // Backward-compatible alias — old code that injects `DrizzleService`
    // will get the write connection. Remove once all consumers are migrated.
    {
      provide: 'DrizzleService',
      useExisting: DrizzleWriteService
    }
  ],
  exports: [DrizzleWriteService, DrizzleReadService, 'DrizzleService']
})
export class DrizzleModule {}
