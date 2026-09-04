/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Guards for the URLs the main process receives from the renderer: the app
 * menu spec, window.open targets and navigation requests. Every one of them
 * ends up at `shell.openExternal` or `webContents.loadURL`, so the scheme has
 * to be checked before the URL reaches either.
 *
 * Both helpers parse the URL rather than matching on its text, which also
 * normalizes the scheme so casing variants like "HTTPS:" cannot slip past.
 */

/**
 * Returns true only for absolute http/https URLs, the ones safe to hand to
 * `shell.openExternal`.
 *
 * `openExternal` invokes the OS handler for whatever scheme it is given, so
 * without this check a renderer-supplied string could open file:// locations
 * and UNC paths or launch other installed applications.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns true only for URLs belonging to the app's own frontend: the same
 * scheme and host as `startUrl`, and a path that is either `startUrl`'s own or
 * inside the directory holding it.
 *
 * Only these may be loaded into the main window, which runs with the app's
 * preload script: a file:, data: or remote URL loaded there would execute
 * inside the app's trusted context.
 *
 * @param url - the URL to check.
 * @param startUrl - the URL the main window was started with.
 */
export function isAppUrl(url: string, startUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const appUrl = new URL(startUrl);

    // Comparing scheme and host separately, because every file: URL has the
    // same opaque "null" origin and so origin equality would accept any local
    // path in a packaged build.
    if (parsed.protocol !== appUrl.protocol || parsed.host !== appUrl.host) {
      return false;
    }

    // The whole path first, so "…/frontend/index.html#/route" matches, then the
    // directory holding it, so sibling assets do too. Prefix-matching the full
    // startUrl instead would accept a path that merely starts the same way.
    const appDir = appUrl.pathname.slice(0, appUrl.pathname.lastIndexOf('/') + 1);

    return parsed.pathname === appUrl.pathname || parsed.pathname.startsWith(appDir);
  } catch {
    return false;
  }
}
