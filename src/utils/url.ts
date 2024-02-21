import { isBrowser } from './platform';

export function getBaseUrl() {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  } else if (process.env.NEXT_PUBLIC_APP_BASE_URL) {
    return process.env.NEXT_PUBLIC_APP_BASE_URL;
  } else if (isBrowser) {
    return '';
  }

  return `http://${process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost'}:${process.env.PORT ?? getListeningPort()}`;
}

export function getListeningPort() {
  return process.env.PORT ?? 3000;
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
