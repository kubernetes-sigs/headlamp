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
import { isAppInternalUrl, isSafeExternalUrl } from './urlValidation';

describe('isSafeExternalUrl', () => {
  it('allows http and https URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('https://headlamp.dev/docs/latest/')).toBe(true);
  });

  it('rejects file, smb and other OS-handler schemes', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('smb://attacker/share')).toBe(false);
    expect(isSafeExternalUrl('vscode://file/etc/passwd')).toBe(false);
  });

  it('rejects javascript and data URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});

describe('isAppInternalUrl', () => {
  const startUrl = 'http://localhost:3000';

  it('accepts the app URL itself and its pages', () => {
    expect(isAppInternalUrl(startUrl, startUrl)).toBe(true);
    expect(isAppInternalUrl(`${startUrl}/cluster/foo`, startUrl)).toBe(true);
    expect(isAppInternalUrl(`${startUrl}#/route`, startUrl)).toBe(true);
    expect(isAppInternalUrl(`${startUrl}?query=1`, startUrl)).toBe(true);
  });

  it('rejects prefix look-alikes that are not the app origin', () => {
    expect(isAppInternalUrl('http://localhost:3000.evil.com', startUrl)).toBe(false);
    expect(isAppInternalUrl('http://localhost:3000@evil.com', startUrl)).toBe(false);
    expect(isAppInternalUrl('http://localhost:30000', startUrl)).toBe(false);
    expect(isAppInternalUrl('http://evil.com', startUrl)).toBe(false);
  });

  it('handles a file:// start URL and its look-alikes', () => {
    const fileStart = 'file:///Applications/Headlamp.app/frontend/index.html';
    expect(isAppInternalUrl(`${fileStart}#/route`, fileStart)).toBe(true);
    expect(isAppInternalUrl(`${fileStart}.evil`, fileStart)).toBe(false);
  });
});
