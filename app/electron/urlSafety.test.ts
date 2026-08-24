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

import { describe, expect, it } from 'vitest';
import { isAppUrl, isSafeExternalUrl } from './urlSafety';

/** The startUrl of a packaged build, where the frontend is loaded from disk. */
const PACKAGED_START_URL = 'file:///opt/Headlamp/resources/frontend/index.html';
/** The startUrl of a dev build, where the frontend is served by the dev server. */
const DEV_START_URL = 'http://localhost:3000';

describe('isSafeExternalUrl', () => {
  it.each(['http://example.com', 'https://headlamp.dev/docs/latest/', 'HTTPS://headlamp.dev'])(
    'allows the http(s) URL %s',
    url => {
      expect(isSafeExternalUrl(url)).toBe(true);
    }
  );

  it.each([
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    'smb://example.com/share',
    'search-ms:query=x',
    '\\\\example.com\\share',
    '/docs/latest',
    '',
  ])('rejects %s, which openExternal would hand to the OS', url => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
});

describe('isAppUrl', () => {
  it('allows the start URL itself', () => {
    expect(isAppUrl(PACKAGED_START_URL, PACKAGED_START_URL)).toBe(true);
    expect(isAppUrl(DEV_START_URL, DEV_START_URL)).toBe(true);
  });

  it('allows a route within the app, which lives in the hash', () => {
    expect(isAppUrl(`${PACKAGED_START_URL}#/settings`, PACKAGED_START_URL)).toBe(true);
    expect(isAppUrl(`${DEV_START_URL}/#/settings`, DEV_START_URL)).toBe(true);
  });

  it('allows an asset next to the frontend entry point', () => {
    expect(isAppUrl('file:///opt/Headlamp/resources/frontend/about.html', PACKAGED_START_URL)).toBe(
      true
    );
  });

  it.each([
    'file:///etc/passwd',
    'file:///opt/Headlamp/resources/index.html',
    'file:///opt/Headlamp/resources/frontend/../../secret.html',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    'https://evil.example.com',
    'index.html#/settings',
    '',
  ])('rejects %s, which must never load in the app window', url => {
    expect(isAppUrl(url, PACKAGED_START_URL)).toBe(false);
  });

  it('rejects a host that merely starts like the app host', () => {
    // "http://localhost:30000" prefix-matches "http://localhost:3000" as text.
    expect(isAppUrl('http://localhost:30000/#/settings', DEV_START_URL)).toBe(false);
  });

  it('rejects the same path over a different scheme', () => {
    expect(isAppUrl('http://localhost:3000/#/settings', PACKAGED_START_URL)).toBe(false);
    expect(isAppUrl('file:///opt/Headlamp/resources/frontend/index.html', DEV_START_URL)).toBe(
      false
    );
  });
});
