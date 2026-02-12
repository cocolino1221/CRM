import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  correlationId?: string;
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.headers['x-correlation-id'] as string;
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    // Handle HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || error;
      }
    }
    // Handle TypeORM query errors
    else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      message = this.handleDatabaseError(exception);
      error = 'Database Error';
    }
    // Handle generic errors
    else if (exception instanceof Error) {
      message = isProduction ? 'An unexpected error occurred' : exception.message;
      error = exception.name;
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
    };

    if (correlationId) {
      errorResponse.correlationId = correlationId;
    }

    // Include stack trace in development
    if (!isProduction && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    // Log error details
    const logMessage = `${request.method} ${request.url} - ${status} - ${message}`;

    if (status >= 500) {
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : '');
    } else if (status >= 400) {
      this.logger.warn(logMessage);
    }

    response.status(status).json(errorResponse);
  }

  private handleDatabaseError(error: QueryFailedError): string {
    const message = error.message;

    // Handle common database errors
    if (message.includes('unique constraint')) {
      return 'A record with this value already exists';
    }

    if (message.includes('foreign key constraint')) {
      return 'Cannot perform this operation due to related records';
    }

    if (message.includes('not-null constraint')) {
      return 'Required field is missing';
    }

    if (message.includes('invalid input syntax')) {
      return 'Invalid data format provided';
    }

    // In production, return generic message
    if (process.env.NODE_ENV === 'production') {
      return 'Database operation failed';
    }

    return message;
  }
}
