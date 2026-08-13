import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContext } from './request-context';
import type { Request, Response } from 'express';

describe('RequestContextMiddleware', () => {
  const middleware = new RequestContextMiddleware();

  it('propagates a safe incoming request ID', () => {
    const setHeader = jest.fn();
    let observedRequestId: string | undefined;

    middleware.use(
      { header: () => 'web-01JABCDEF', headers: {} } as unknown as Request,
      { setHeader } as unknown as Response,
      () => {
        observedRequestId = RequestContext.getRequestId();
      }
    );

    expect(observedRequestId).toBe('web-01JABCDEF');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'web-01JABCDEF');
  });

  it('replaces an unsafe request ID', () => {
    const setHeader = jest.fn();
    let observedRequestId: string | undefined;

    middleware.use(
      { header: () => 'unsafe request id with spaces', headers: {} } as unknown as Request,
      { setHeader } as unknown as Response,
      () => {
        observedRequestId = RequestContext.getRequestId();
      }
    );

    expect(observedRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', observedRequestId);
  });
});
