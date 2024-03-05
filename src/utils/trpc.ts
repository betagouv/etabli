import { TRPCClientErrorLike } from '@trpc/client';
import { UseTRPCQueryResult } from '@trpc/react-query/dist/shared';
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@etabli/src/server/app-router';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export class AggregatedQueries {
  queries: UseTRPCQueryResult<any, any>[] = [];

  constructor(...queries: UseTRPCQueryResult<any, any>[]) {
    this.queries = queries;
  }

  public get hasError(): boolean {
    return this.errors.length > 0;
  }

  public get errors() {
    return this.queries.filter((query) => !!query.error).map((query) => query.error);
  }

  public get refetchs() {
    return this.queries.map((query) => query.refetch);
  }

  public get isLoading(): boolean {
    return this.queries.filter((query) => query.isLoading).length > 0;
  }

  public get isInitialLoading(): boolean {
    return this.queries.filter((query) => query.isInitialLoading).length > 0;
  }
}
