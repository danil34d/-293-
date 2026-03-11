export function isLoginPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && pathname.startsWith('/login');
}

export function isWallboardPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && (pathname.startsWith('/wallboard') || pathname.startsWith('/status'));
}

export function isPublicAppPath(pathname: string | null | undefined): boolean {
  return isLoginPath(pathname) || isWallboardPath(pathname);
}
