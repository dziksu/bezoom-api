// Re-export from the new shared-kernel location for backward compatibility.
// Remove this file once all consumers import from shared-kernel directly.
export { DrizzleWriteService as DrizzleService } from '../shared-kernel/infrastructure/drizzle-write.service';
export { DrizzleWriteService } from '../shared-kernel/infrastructure/drizzle-write.service';
export { DrizzleReadService } from '../shared-kernel/infrastructure/drizzle-read.service';
