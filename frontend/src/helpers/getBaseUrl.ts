import { isElectron } from './isElectron';

declare global {
  interface Window {
    /**
     * headlampBaseUrl is used to set the base URL for the app.
     *
     * When headlamp is compiled if a baseUrl is set, then it adds this variable to the
     * appropriate base URL from the environment.
     *
     * Read only.
     */
    headlampBaseUrl?: string;
  }
}

/**
 * @returns the baseUrl for the app based on window.headlampBaseUrl or import.meta.env.PUBLIC_URL
 *
 * This could be either '' meaning /, or something like '/headlamp'.
 */
export function getBaseUrl(): string {
  let baseUrl = '';
  if (isElectron()) {
    return '';
  }
  if (window?.headlampBaseUrl !== undefined) {
    baseUrl = window.headlampBaseUrl;
  } else {
    baseUrl = import.meta.env.PUBLIC_URL ? import.meta.env.PUBLIC_URL : '';
  }

  if (baseUrl === './' || baseUrl === '.' || baseUrl === '/') {
    baseUrl = '';
  }
  return baseUrl;
}
