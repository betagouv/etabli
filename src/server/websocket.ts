import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

import { AppRouter, appRouter } from '@etabli/src/server/app-router';
import { createContext } from '@etabli/src/server/context';
import { getListeningWebsocketPort } from '@etabli/src/utils/url';

//
// [IMPORTANT] We start the websocket server on another port because Next.js is monopolizes the websocket
// listeners in development making it hard to connect onto it. The custom server.js is also not available in `standalone` Next.js ouput
// So the production provider must allow using multiple ports
//

export let websocketServer: WebSocketServer | null = null;
export let handler: ReturnType<typeof applyWSSHandler<AppRouter>> | null = null;

export async function createWebsocketServer() {
  const port = getListeningWebsocketPort();

  const wss = new WebSocketServer({
    port: port,
  });

  websocketServer = wss;

  handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext(opts: CreateNextContextOptions | CreateWSSContextFnOptions) {
      return createContext({ ...opts, type: 'api' });
    },
  });

  wss.on('connection', (ws) => {
    console.log(`++ Connection (${wss.clients.size})`);

    ws.once('close', () => {
      console.log(`-- Connection (${wss.clients.size})`);
    });
  });

  console.log(`WebSocket Server listening on ws://localhost:${port}`);
}

export async function closeWebsocketServer() {
  handler && handler.broadcastReconnectNotification();
  websocketServer && websocketServer.close();
}
