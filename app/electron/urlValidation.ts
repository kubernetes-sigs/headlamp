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
 * Returns true when url uses a scheme that is safe to hand to the OS or to
 * navigate to. Only http and https are allowed; other schemes such as file://,
 * smb://, data:, javascript: and custom protocol handlers are rejected so an
 * untrusted URL cannot open a local file, reach a network share, or launch
 * another installed application via shell.openExternal or loadURL.
 *
 * @param url - The URL to check.
 * @returns True if the URL uses the http or https scheme.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns true when url points at the app's own content (startUrl) and can be
 * opened inside the app window. A plain `startsWith` check is not enough: with
 * startUrl "http://localhost:3000", it would also match
 * "http://localhost:3000.evil.com" or "http://localhost:3000@evil.com". So the
 * prefix must be followed by a path, query or fragment delimiter (or be an
 * exact match).
 *
 * @param url - The URL being navigated to or opened.
 * @param startUrl - The app's start URL.
 * @returns True if url is the app's own URL or a page/route within it.
 */
export function isAppInternalUrl(url: string, startUrl: string): boolean {
  if (!url.startsWith(startUrl)) {
    return false;
  }

  // An exact match, or a startUrl that already ends at a boundary, is internal.
  if (url.length === startUrl.length || /[/#?]$/.test(startUrl)) {
    return true;
  }

  const nextChar = url.charAt(startUrl.length);
  return nextChar === '/' || nextChar === '#' || nextChar === '?';
}
