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

import { isValidRedirectPath } from './AppContainer';

describe('isValidRedirectPath', () => {
  it('should allow safe internal paths', () => {
    expect(isValidRedirectPath('/dashboard')).toBe(true);
    expect(isValidRedirectPath('/settings/cluster')).toBe(true);
    expect(isValidRedirectPath('../settings')).toBe(true);
    expect(isValidRedirectPath('./relative')).toBe(true);
  });

  it('should block external HTTP URLs', () => {
    expect(isValidRedirectPath('http://malicious-site.com')).toBe(false);
    expect(isValidRedirectPath('http://evil.com/path')).toBe(false);
  });

  it('should block external HTTPS URLs', () => {
    expect(isValidRedirectPath('https://evil.com')).toBe(false);
    expect(isValidRedirectPath('https://malicious.com/path')).toBe(false);
  });

  it('should block protocol-relative URLs', () => {
    expect(isValidRedirectPath('//malicious.com')).toBe(false);
    expect(isValidRedirectPath('//evil.com/path')).toBe(false);
  });

  it('should block dangerous protocols', () => {
    expect(isValidRedirectPath('javascript:alert("XSS")')).toBe(false);
    expect(isValidRedirectPath('data:text/html,<script>alert("XSS")</script>')).toBe(false);
    expect(isValidRedirectPath('vbscript:msgbox("XSS")')).toBe(false);
    expect(isValidRedirectPath('file:///etc/passwd')).toBe(false);
    expect(isValidRedirectPath('ftp://malicious.com')).toBe(false);
  });

  it('should block empty or null paths', () => {
    expect(isValidRedirectPath('')).toBe(false);
    expect(isValidRedirectPath('   ')).toBe(false);
    expect(isValidRedirectPath(null as any)).toBe(false);
    expect(isValidRedirectPath(undefined as any)).toBe(false);
  });
});
