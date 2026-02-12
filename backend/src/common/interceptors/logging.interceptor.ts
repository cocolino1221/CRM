import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url, body, headers } = request;

    const correlationId = headers['x-correlation-id'] as string;
    const userAgent = headers['user-agent'] || 'Unknown';
    const ip = request.ip || request.socket.remoteAddress;

    const startTime = Date.now();

    // Log request
    const requestLog = {
      method,
      url,
      correlationId,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    };

    // Don't log sensitive data in production
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Incoming Request: ${JSON.stringify(requestLog)}`);

      // Log body for non-GET requests (excluding sensitive endpoints)
      if (method !== 'GET' && !url.includes('/auth/')) {
        this.logger.debug(`Request Body: ${JSON.stringify(body)}`);
      }
    } else {
      this.logger.log(`${method} ${url} - ${correlationId}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const { statusCode } = response;

          const responseLog = {
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            correlationId,
            timestamp: new Date().toISOString(),
          };

          if (statusCode >= 400) {
            this.logger.warn(`Response: ${JSON.stringify(responseLog)}`);
          } else {
            this.logger.log(
              `${method} ${url} - ${statusCode} - ${duration}ms${correlationId ? ` [${correlationId}]` : ''}`,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `${method} ${url} - ERROR - ${duration}ms${correlationId ? ` [${correlationId}]` : ''}`,
            error.stack,
          );
        },
      }),
    );
  }
}
