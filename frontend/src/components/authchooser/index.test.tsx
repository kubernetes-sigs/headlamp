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
import { buildOauthUrl } from './buildOauthUrl';

const FIXED_NOW = 'Wed May 06 2026 00:00:00 GMT+0000';

function parseQuery(url: string): URLSearchParams {
  const q = url.split('?')[1] || '';
  return new URLSearchParams(q);
}

describe('buildOauthUrl', () => {
  it('uses location.state.from.pathname+search when provided', () => {
    const url = buildOauthUrl(
      '/',
      'main',
      'popup',
      '/c/main/pods',
      '?view=logs',
      '/auth',
      '',
      FIXED_NOW
    );
    const q = parseQuery(url);

    expect(q.get('cluster')).toBe('main');
    expect(q.get('mode')).toBe('popup');
    expect(q.get('returnTo')).toBe('/c/main/pods?view=logs');
  });

  it('falls back to currentPath when from is empty', () => {
    const url = buildOauthUrl(
      '/',
      'main',
      'popup',
      '',
      '',
      '/c/main/deployments',
      '?ns=default',
      FIXED_NOW
    );
    const q = parseQuery(url);

    expect(q.get('returnTo')).toBe('/c/main/deployments?ns=default');
  });

  it('strips fragments from returnTo', () => {
    const url = buildOauthUrl(
      '/',
      'main',
      'popup',
      '/c/main/pods',
      '?view=logs#tab=2',
      '',
      '',
      FIXED_NOW
    );
    const q = parseQuery(url);

    expect(q.get('returnTo')).toBe('/c/main/pods?view=logs');
    expect(q.get('returnTo')).not.toContain('#');
  });

  it('omits returnTo when the candidate is /auth itself', () => {
    const url = buildOauthUrl('/', 'main', 'popup', '/auth', '?cluster=main', '', '', FIXED_NOW);
    const q = parseQuery(url);

    expect(q.has('returnTo')).toBe(false);
  });

  it('passes mode=fullPage through', () => {
    const url = buildOauthUrl('/', 'main', 'fullPage', '/c/main', '', '', '', FIXED_NOW);
    const q = parseQuery(url);

    expect(q.get('mode')).toBe('fullPage');
  });

  it('always includes the dt cache buster', () => {
    const url = buildOauthUrl('/', 'main', 'popup', '/c/main', '', '', '', FIXED_NOW);
    const q = parseQuery(url);

    expect(q.get('dt')).toBe(FIXED_NOW);
  });
});
