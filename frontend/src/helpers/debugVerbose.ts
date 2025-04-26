/** used by isDebugVerbose and debugVerbose */
export const verboseModDebug: string[] = [];

/**
 * To allow us to include verbose debug information for a module.
 *
 * - Gives us the line number and file of the log in developer console.
 *   If it was in a wrapper function it just shows the wrapper function line number.
 * - Turned off by default, and the message doesn't even get constructed if it's off.
 *   This is important do high frequency messages so not impact performance.
 * - ON/OFF via environment variable REACT_APP_DEBUG_VERBOSE='k8s/apiProxy'
 * - ON/OFF via code debugVerbose('k8s/apiProxy').
 *   So can easily turn it on when debugging.
 * - Also can turn on just a function debugVerbose('k8s/apiProxy@refreshToken')
 *
 * @param modName only show verbose debugging for this module name.
 * @returns true if verbose debugging should be done.
 *
 * @example
 *
 * To add some verbose debugging to a module:
 * ```ts
 * import { isDebugVerbose } from './helpers';
 * if (isDebugVerbose('k8s/apiProxy')) {
 *     console.debug('k8s/apiProxy', {dataToLog});
 * }
 * ```
 *
 * You can also include a symbol name:
 * ```ts
 * import { isDebugVerbose } from './helpers';
 * if (isDebugVerbose('k8s/apiProxy@refreshToken')) {
 *     console.debug('k8s/apiProxy@refreshToken', {dataToLog});
 * }
 * ```
 *
 * In that example:
 * - 'k8s/apiProxy' is the module name.
 * - 'refreshToken' is the function symbol name.
 *
 * To turn verbose debugging on via code in that module:
 * ```ts
 * import { debugVerbose } from './helpers';
 * debugVerbose('k8s/apiProxy')
 *
 * // or for everything in refreshToken:
 * debugVerbose('k8s/apiProxy@refreshToken')
 * ```
 *
 * To turn it on for multiple modules via environment variable:
 * ```bash
 * REACT_APP_DEBUG_VERBOSE="k8s/apiProxy i18n/config" make run-frontend
 * ```
 *
 * To turn it on via environment variable for all modules:
 * ```bash
 * REACT_APP_DEBUG_VERBOSE="all" make run-frontend
 * ```
 */
export function isDebugVerbose(modName: string): boolean {
  if (verboseModDebug.filter(mod => modName.indexOf(mod) > 0).length > 0) {
    return true;
  }

  return (
    import.meta.env.REACT_APP_DEBUG_VERBOSE === 'all' ||
    !!(
      import.meta.env.REACT_APP_DEBUG_VERBOSE &&
      import.meta.env.REACT_APP_DEBUG_VERBOSE?.indexOf(modName) !== -1
    )
  );
}

/**
 * debugVerbose turns on verbose debugging for a module.
 *
 * @param modName turn on verbose debugging for this module name.
 *
 * @see isDebugVerbose
 */
export function debugVerbose(modName: string): void {
  verboseModDebug.push(modName);
}
