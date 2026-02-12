import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Get existing correlation ID or generate new one
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();

    // Add correlation ID to request headers
    req.headers['x-correlation-id'] = correlationId;

    // Add correlation ID to response headers
    res.setHeader('X-Correlation-ID', correlationId);

    next();
  }
}
