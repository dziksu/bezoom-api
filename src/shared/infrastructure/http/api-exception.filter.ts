import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODE_PATTERN, ApiErrorBody, ApiFieldError } from './api-error';
import { RequestContext } from '../observability/request-context';

interface StructuredExceptionResponse {
  code?: unknown;
  message?: unknown;
  fields?: unknown;
  details?: unknown;
}

const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS'
};

function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && API_ERROR_CODE_PATTERN.test(value);
}

function isFields(value: unknown): value is Record<string, ApiFieldError[]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDetails(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const structured =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as StructuredExceptionResponse)
        : undefined;
    const requestId = this.requestId(request);
    const body: ApiErrorBody = {
      error: {
        code: isErrorCode(structured?.code)
          ? structured.code
          : isErrorCode(structured?.message)
            ? structured.message
            : typeof exceptionResponse === 'string' && isErrorCode(exceptionResponse)
              ? exceptionResponse
              : (STATUS_CODES[status] ?? 'INTERNAL_SERVER_ERROR'),
        requestId
      }
    };

    if (isFields(structured?.fields)) {
      body.error.fields = structured.fields;
    }
    if (isDetails(structured?.details)) {
      body.error.details = structured.details;
    }

    response.setHeader('x-request-id', requestId);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl || request.url} failed (${requestId})`,
        exception instanceof Error ? exception.stack : undefined
      );
    }

    response.status(status).json(body);
  }

  private requestId(request: Request): string {
    const contextualRequestId = RequestContext.getRequestId();
    if (contextualRequestId) {
      return contextualRequestId;
    }
    const header = request.headers['x-request-id'];
    const candidate = Array.isArray(header) ? header[0] : header;
    return typeof candidate === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
  }
}
