import { isBrowser } from './platform';

export function getBaseUrl() {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  } else if (process.env.NEXT_PUBLIC_APP_BASE_URL) {
    return process.env.NEXT_PUBLIC_APP_BASE_URL;
  } else if (isBrowser) {
    return '';
  }

  return `http://localhost:${process.env.PORT ?? getListeningPort()}`;
}

export function getListeningPort() {
  return process.env.PORT ?? 3000;
}

export function getWsBaseUrl() {
  if (process.env.NEXT_PUBLIC_WEBSOCKET_BASE_URL) {
    return process.env.NEXT_PUBLIC_WEBSOCKET_BASE_URL;
  }

  return `ws://localhost:${process.env.WEBSOCKET_PORT ?? getListeningWebsocketPort()}`;
}

export function getListeningWebsocketPort() {
  return process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT, 10) : 3001;
}

export function hasPathnameThisRoot(pathname: string | null, rootPathname: string): boolean {
  if (!pathname) {
    return false;
  }

  return pathname.startsWith(rootPathname);
}

export function hasPathnameThisMatch(pathname: string | null, rootPathname: string): boolean {
  if (!pathname) {
    return false;
  }

  return pathname === rootPathname;
}
