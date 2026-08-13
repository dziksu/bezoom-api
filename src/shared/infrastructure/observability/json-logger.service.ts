import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContext } from './request-context';

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

export interface HttpLogRecord {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

const REDACTED = '[REDACTED]';
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const PHONE_PATTERN = /(?<!\w)\+?\d(?:[\s()-]*\d){7,14}(?!\w)/g;

@Injectable()
export class JsonLoggerService implements LoggerService {
  httpRequest(record: HttpLogRecord): void {
    this.emit('info', 'HTTP_REQUEST_COMPLETED', undefined, undefined, {
      method: record.method,
      route: record.route,
      status_code: record.statusCode,
      duration_ms: Number(record.durationMs.toFixed(3))
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const context = this.extractContext(optionalParams);
    const trace = this.extractTrace(optionalParams);
    this.emit(level, this.redact(this.stringifyMessage(message)), context, trace);
  }

  private emit(
    level: LogLevel,
    message: string,
    context?: string,
    trace?: string,
    attributes: Record<string, unknown> = {}
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: process.env.OTEL_SERVICE_NAME || 'bezoom-api',
      environment: process.env.NODE_ENV || 'development',
      request_id: RequestContext.getRequestId(),
      context,
      message,
      trace,
      ...attributes
    };

    const output = `${JSON.stringify(entry)}\n`;
    if (level === 'error' || level === 'fatal' || level === 'warn') {
      process.stderr.write(output);
      return;
    }
    process.stdout.write(output);
  }

  private extractContext(optionalParams: unknown[]): string | undefined {
    const last = optionalParams.at(-1);
    return typeof last === 'string' && !last.includes('\n') ? this.redact(last) : undefined;
  }

  private extractTrace(optionalParams: unknown[]): string | undefined {
    const trace = optionalParams.find((value) => typeof value === 'string' && value.includes('\n'));
    return typeof trace === 'string' ? this.redact(trace) : undefined;
  }

  private stringifyMessage(message: unknown): string {
    if (message instanceof Error) {
      return message.message;
    }
    if (typeof message === 'string') {
      return message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return 'UNSERIALIZABLE_LOG_VALUE';
    }
  }

  private redact(value: string): string {
    return value
      .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
      .replace(EMAIL_PATTERN, REDACTED)
      .replace(PHONE_PATTERN, REDACTED);
  }
}
