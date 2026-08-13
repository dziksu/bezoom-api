import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header(REQUEST_ID_HEADER);
    const requestId = incomingRequestId && SAFE_REQUEST_ID.test(incomingRequestId) ? incomingRequestId : randomUUID();

    request.headers ??= {};
    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    RequestContext.run({ requestId }, next);
  }
}
