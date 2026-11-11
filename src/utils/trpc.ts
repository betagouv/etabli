import { TRPCClientErrorLike } from '@trpc/client';
import { UseTRPCQueryResult } from '@trpc/react-query/shared';
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

  // No data yet (enabled or not)
  public get isLoading(): boolean {
    return this.queries.filter((query) => query.isPending).length > 0;
  }

  // Fetching for the first time
  public get isInitialLoading(): boolean {
    return this.queries.filter((query) => query.isLoading).length > 0;
  }
}
