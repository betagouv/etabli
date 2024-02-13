export type RpcResponse<Data> = RpcSuccessResponse<Data> | RpcErrorResponse;

export type RpcSuccessResponse<Data> = {
  id: null;
  result: { type: 'data'; data: Data };
};

export type RpcErrorResponse = {
  id: null;
  error: {
    message: string;
    code: number;
    data: {
      code: string;
      httpStatus: number;
      stack: string;
      path: string; //TQuery
    };
  };
};

// According to JSON-RPC 2.0 and tRPC documentation.
// https://trpc.io/docs/rpc
export const jsonRpcSuccessResponse = (data: unknown) => {
  return {
    result: { data },
  };
};

export const jsonRpcErrorResponse = (err: Error) => {
  return {
    error: {
      json: {
        message: err.message,
        code: -50100,
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          stack: err.stack,
        },
      },
    },
  };
};
