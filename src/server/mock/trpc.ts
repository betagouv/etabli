import { DefaultBodyType, DelayMode, PathParams, ResponseTransformer, RestRequest, rest } from 'msw';
import path from 'path';
import superjson from 'superjson';

import { mockBaseUrl } from '@etabli/src/server/mock/environment';
import { jsonRpcErrorResponse, jsonRpcSuccessResponse } from '@etabli/src/server/mock/requests';
import { RouterInputs, RouterOutputs } from '@etabli/src/utils/trpc';

/**
 * Mocks a TRPC endpoint and returns a msw handler for Storybook.
 * Only supports routes with two levels.
 * The path and response is fully typed and infers the type from your routes file.
 * @todo make it accept multiple endpoints
 * @param endpoint.path - path to the endpoint ex. ["post", "create"]
 * @param endpoint.response - response to return ex. {id: 1}
 * @param endpoint.type - specific type of the endpoint ex. "query" or "mutation" (defaults to "query")
 * @returns - msw endpoint
 * @example
 * Page.parameters = {
    msw: {
      handlers: [
        getTRPCMock({
          path: ["post", "getMany"],
          type: "query",
          response: [
            { id: 0, title: "test" },
            { id: 1, title: "test" },
          ],
        }),
      ],
    },
  };
 */
export const getTRPCMock = <
  K1 extends keyof RouterInputs & string,
  O extends RouterOutputs[K1], // all its keys
>(endpoint: {
  path: [K1];
  response: O | object | Error;
  type?: 'query' | 'mutation' | 'subscription';
  delayHook?: (req: RestRequest<DefaultBodyType, PathParams<string>>, params: RouterInputs[K1]) => number | DelayMode | null;
}) => {
  const fn = endpoint.type === 'mutation' || endpoint.type === 'subscription' ? rest.post : rest.get;

  const route = `${mockBaseUrl}/api/trpc/${endpoint.path[0]}`;

  return fn(route, (req, res, ctx) => {
    const isResponseAnError = (endpoint.response as any) instanceof Error;

    let rpcResponse: DefaultBodyType;
    if (isResponseAnError) {
      rpcResponse = jsonRpcErrorResponse(endpoint.response as Error);
    } else {
      // In the real app we use the `superjson` transformer to encode/decode complex response objects, so we have to mimic the server behavior
      const transformedResponse = superjson.serialize(endpoint.response);

      rpcResponse = jsonRpcSuccessResponse(transformedResponse);
    }

    const transformers: ResponseTransformer<DefaultBodyType, any>[] = [];

    if (!!endpoint.delayHook) {
      let params: RouterInputs[K1];
      if (endpoint.type === 'query') {
        params = extractParamsFromQuery(req) as RouterInputs[K1];
      } else {
        params = req.params as RouterInputs[K1];
      }

      const delayToAdd = endpoint.delayHook(req, params);

      if (delayToAdd !== null && delayToAdd !== 0) {
        transformers.push(ctx.delay(delayToAdd));
      }
    }

    // Note we use `httpLink` and not `httpBatchLink` when mocking, so no need to wrap the response into an array
    transformers.push(ctx.json(rpcResponse));

    return res(...transformers);
  });
};

export function extractParamsFromQuery(req: RestRequest<DefaultBodyType, PathParams<string>>): object {
  const url = new URL(req.url);

  const inputQueryParam = url.searchParams.get('input');
  if (inputQueryParam) {
    const params = JSON.parse(inputQueryParam)[0];

    return params;
  }

  return {};
}
