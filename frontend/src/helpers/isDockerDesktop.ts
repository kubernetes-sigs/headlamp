declare global {
  interface Window {
    /**
     * Used by docker desktop. If it's there, probably it's docker desktop.
     */
    ddClient: any | undefined;
  }
}

/**
 * isDockerDesktop checks if ddClient is available in the window object
 * if it is available then it is running in docker desktop
 *
 * @returns true if Headlamp is running inside docker desktop
 */
export function isDockerDesktop(): boolean {
  if (window?.ddClient === undefined) {
    return false;
  }
  return true;
}
