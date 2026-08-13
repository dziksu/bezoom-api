import { registerAs } from '@nestjs/config';

export type EventPipelineMode = 'development_passthrough' | 'disabled';

export interface EventPipelineConfig {
  mode: EventPipelineMode;
  dispatchIntervalMs: number;
}

export default registerAs('eventPipeline', (): EventPipelineConfig => {
  const defaultMode: EventPipelineMode = process.env.NODE_ENV === 'production' ? 'disabled' : 'development_passthrough';
  const configuredMode = process.env.EVENT_PIPELINE_MODE as EventPipelineMode | undefined;

  return {
    mode: configuredMode ?? defaultMode,
    dispatchIntervalMs: Math.max(100, Number(process.env.EVENT_PIPELINE_DISPATCH_INTERVAL_MS ?? 500))
  };
});
