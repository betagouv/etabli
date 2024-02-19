import * as Sentry from '@sentry/nextjs';
import createHttpError from 'http-errors';
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

import { BusinessError, internalServerErrorError } from '@etabli/src/models/entities/errors';

export type Method = 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'PURGE' | 'LINK' | 'UNLINK';

export interface ApiHandlerWrapperOptions {
  restrictMethods?: Method[];
}

export function apiHandlerWrapper(handler: NextApiHandler, options?: ApiHandlerWrapperOptions) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Check method is allowed
      if (options?.restrictMethods && !options.restrictMethods.includes(req.method?.toUpperCase() as Method)) {
        throw new createHttpError.MethodNotAllowed();
      }

      await handler(req, res);
    } catch (error) {
      await errorHandler(error, req, res);
    }
  };
}

export async function errorHandler(error: unknown, req: NextApiRequest, res: NextApiResponse) {
  console.error(error);

  if (error instanceof BusinessError) {
    res.status(error.httpCode || 400).json({ error: error.json() });
  } else if (createHttpError.isHttpError(error) && error.expose) {
    // Handle errors thrown with http-errors module
    // (meaning the one throwing wants specific HTTP response, it's kind of a business error but with no translation at the end)
    res.status(error.statusCode).json({ error: { message: error.message } });
  } else {
    // Notify Sentry of this unexpected error
    Sentry.withScope(function (scope) {
      scope.setUser(null);

      Sentry.captureException(error);
    });

    res.status(500).json({
      error: internalServerErrorError.json(),
    });
  }
}
