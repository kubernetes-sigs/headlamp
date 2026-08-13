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
 * Utilities for handling headlamp:// protocol deep links. The scheme itself is
 * registered through the electron-builder "protocols" configuration in
 * app/package.json.
 */

/**
 * Turns a headlamp:// URL into the in-app hash route it points to.
 *
 * Custom protocol URLs carry their first path segment in the URL host:
 * headlamp://c/mycluster/pods parses with hostname "c" and pathname
 * "/mycluster/pods". The route is rebuilt from both parts and keeps the query
 * string, so that example maps to "/c/mycluster/pods".
 *
 * @param rawUrl - The URL the operating system handed to the app.
 * @returns The hash route, or null if the URL is not a usable headlamp:// URL.
 */
export function getRouteFromProtocolUrl(rawUrl: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== 'headlamp:' ||
    !!parsedUrl.username ||
    !!parsedUrl.password ||
    !!parsedUrl.port
  ) {
    return null;
  }

  const routePath = `${parsedUrl.hostname}${parsedUrl.pathname}`.replace(/^\/+/, '');
  if (!routePath) {
    return null;
  }

  return `/${routePath}${parsedUrl.search}`;
}

/**
 * Finds the first headlamp:// URL in a list of process arguments.
 *
 * Windows and Linux deliver protocol URLs through the command line — in
 * process.argv on a cold start and in the second-instance event arguments when
 * the app is already running — rather than through the macOS-only open-url
 * event.
 */
export function findProtocolUrlInArgv(argv: readonly string[]): string | undefined {
  return argv.find(arg => arg.toLowerCase().startsWith('headlamp://'));
}
