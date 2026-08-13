import { JsonLoggerService } from './json-logger.service';
import { RequestContext } from './request-context';

describe('JsonLoggerService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes structured JSON with request context and redacts common PII', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    RequestContext.run({ requestId: 'request-123' }, () => {
      new JsonLoggerService().log('contact user@example.com at +48 500 600 700', 'ProfileService');
    });

    const entry = JSON.parse(String(write.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      service: 'bezoom-api',
      request_id: 'request-123',
      context: 'ProfileService'
    });
    expect(entry.message).toBe(`contact [REDACTED] at [REDACTED]`);
  });

  it('writes low-cardinality HTTP access fields', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    new JsonLoggerService().httpRequest({
      method: 'GET',
      route: '/api/events/:id',
      statusCode: 200,
      durationMs: 12.3456
    });

    const entry = JSON.parse(String(write.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      message: 'HTTP_REQUEST_COMPLETED',
      method: 'GET',
      route: '/api/events/:id',
      status_code: 200,
      duration_ms: 12.346
    });
  });
});
