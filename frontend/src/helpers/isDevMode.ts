/**
 * @returns true if the app is in development mode.
 */
export function isDevMode(): boolean {
  return import.meta.env.DEV;
}
