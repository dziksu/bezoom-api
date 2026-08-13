import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';
import { RequestContext } from '../observability/request-context';

function createHost(request: Partial<Request>, response: Partial<Response>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined
    })
  } as ArgumentsHost;
}

describe('ApiExceptionFilter', () => {
  it('never exposes an arbitrary exception message', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const setHeader = jest.fn();
    const host = createHost(
      {
        method: 'GET',
        url: '/resource',
        headers: { 'x-request-id': 'request-unknown-message' }
      },
      {
        status,
        json,
        setHeader
      } as Partial<Response>
    );

    new ApiExceptionFilter().catch(new BadRequestException('a human-facing message'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        requestId: 'request-unknown-message'
      }
    });
  });

  it('preserves stable keys, safe details and a valid incoming request id', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const setHeader = jest.fn();
    const host = createHost({ method: 'POST', url: '/resource', headers: { 'x-request-id': 'request-123' } }, {
      status,
      json,
      setHeader
    } as Partial<Response>);

    new ApiExceptionFilter().catch(
      new BadRequestException({ code: 'PHONE_VERIFICATION_COOLDOWN_ACTIVE', details: { retryAfterSeconds: 42 } }),
      host
    );

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request-123');
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PHONE_VERIFICATION_COOLDOWN_ACTIVE',
        requestId: 'request-123',
        details: { retryAfterSeconds: 42 }
      }
    });
  });

  it('preserves a stable key passed as an HttpException message', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const setHeader = jest.fn();
    const host = createHost({ method: 'GET', url: '/profile', headers: { 'x-request-id': 'request-profile' } }, {
      status,
      json,
      setHeader
    } as Partial<Response>);

    new ApiExceptionFilter().catch(new BadRequestException('PROFILE_NOT_FOUND'), host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PROFILE_NOT_FOUND',
        requestId: 'request-profile'
      }
    });
  });

  it('prefers the request context id used by logging and metrics middleware', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const setHeader = jest.fn();
    const host = createHost({ method: 'GET', url: '/profile', headers: { 'x-request-id': 'header-id' } }, {
      status,
      json,
      setHeader
    } as Partial<Response>);

    RequestContext.run({ requestId: 'context-id' }, () => {
      new ApiExceptionFilter().catch(new BadRequestException('BAD_REQUEST'), host);
    });

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'context-id');
    expect(json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', requestId: 'context-id' }
    });
  });
});
