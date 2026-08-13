import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders HTTP RED and Node.js runtime metrics', async () => {
    const service = new MetricsService();

    service.observeHttpRequest('GET', '/api/events/:id', 200, 0.025);
    const output = await service.render();

    expect(output).toContain('bezoom_http_requests_total');
    expect(output).toContain('route="/api/events/:id"');
    expect(output).toContain('bezoom_http_request_duration_seconds_bucket');
    expect(output).toContain('bezoom_process_cpu_user_seconds_total');
  });
});
