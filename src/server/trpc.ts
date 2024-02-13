import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { CustomError, internalServerErrorError } from '@etabli/src/models/entities/errors';
import { Context } from '@etabli/src/server/context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter(opts) {
    const { shape, error } = opts;

    let acceptableZodError = error.cause instanceof ZodError && error.code === 'BAD_REQUEST' ? error.cause : null; // Only forward zod errors from input validation (others should be internal issues)
    let customError = error.cause instanceof CustomError ? error.cause : null;

    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: !!acceptableZodError ? acceptableZodError.issues : null,
        customError: !!customError ? customError.json() : null,
        // If none, we override the entire information to hide any sensitive technical information
        ...(!acceptableZodError && !customError
          ? {
              message: internalServerErrorError.message,
              customError: internalServerErrorError.json(),
            }
          : {}),
      },
    };
  },
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const middleware = t.middleware;

export const mergeRouters = t.mergeRouters;
