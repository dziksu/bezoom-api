import { ApiProperty } from '@nestjs/swagger';
import type { DependencyStatus } from './health.service';

const DEPENDENCY_STATUSES = ['down', 'up'] as const;

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';

  @ApiProperty({ format: 'date-time' })
  timestamp: string;

  @ApiProperty({ enum: ['bezoom-api'] })
  service: 'bezoom-api';
}

export class DependencyChecksDto {
  @ApiProperty({ enum: DEPENDENCY_STATUSES })
  database: DependencyStatus;

  @ApiProperty({ enum: DEPENDENCY_STATUSES })
  redis: DependencyStatus;

  @ApiProperty({ enum: DEPENDENCY_STATUSES })
  object_storage: DependencyStatus;
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ready'] })
  status: 'ready';

  @ApiProperty({ format: 'date-time' })
  timestamp: string;

  @ApiProperty({ enum: ['bezoom-api'] })
  service: 'bezoom-api';

  @ApiProperty({ type: DependencyChecksDto })
  checks: DependencyChecksDto;
}
