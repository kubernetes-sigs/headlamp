import { getBaseUrl } from './getBaseUrl';
import { isDevMode } from './isDevMode';
import { isDockerDesktop } from './isDockerDesktop';
import { isElectron } from './isElectron';

/**
 * @returns URL depending on dev-mode/electron/docker desktop, base-url, and window.location.origin.
 *
 * @example isDevMode | isElectron returns 'http://localhost:4466/'
 * @example isDockerDesktop returns 'http://localhost:64446/'
 * @example base-url set as '/headlamp' returns '/headlamp/'
 * @example isDevMode | isElectron and base-url is set
 *          it returns 'http://localhost:4466/headlamp/'
 * @example returns 'https://headlamp.example.com/'using the window.location.origin of browser
 *
 */
export function getAppUrl(): string {
  let url = isDevMode() || isElectron() ? 'http://localhost:4466' : window.location.origin;
  if (isDockerDesktop()) {
    url = 'http://localhost:64446';
  }

  const baseUrl = getBaseUrl();
  url += baseUrl ? baseUrl + '/' : '/';

  return url;
}
