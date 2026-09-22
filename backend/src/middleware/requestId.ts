import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

// AsyncLocalStorage context to store requestId for the duration of an HTTP request
export const requestIdStore = new AsyncLocalStorage<{ requestId: string }>();

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/**
 * requestIdMiddleware
 * Assigns or propagates X-Request-ID header across HTTP requests and stores it in AsyncLocalStorage.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerVal = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const requestId = Array.isArray(headerVal)
    ? headerVal[0]
    : (headerVal as string) || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  requestIdStore.run({ requestId }, () => {
    next();
  });
}

/**
 * getCurrentRequestId
 * Retrieves current requestId from AsyncLocalStorage context if available.
 */
export function getCurrentRequestId(): string | undefined {
  const store = requestIdStore.getStore();
  return store?.requestId;
}
