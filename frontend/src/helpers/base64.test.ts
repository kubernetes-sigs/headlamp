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

import { decodeBase64, encodeBase64 } from './base64';

describe('base64 helpers', () => {
  it('round-trips ASCII text', () => {
    const input = 'apiVersion: v1\nkind: Config';
    expect(decodeBase64(encodeBase64(input))).toBe(input);
  });

  it('round-trips non-Latin1 text (CJK)', () => {
    const input = 'cluster-name: 集群-生产';
    expect(decodeBase64(encodeBase64(input))).toBe(input);
  });

  it('round-trips emoji', () => {
    const input = 'context: prod 🚀✅';
    expect(decodeBase64(encodeBase64(input))).toBe(input);
  });

  it('round-trips an empty string', () => {
    expect(decodeBase64(encodeBase64(''))).toBe('');
  });

  it('does not throw on characters outside the Latin1 range', () => {
    // The platform btoa() throws InvalidCharacterError here.
    expect(() => encodeBase64('集群')).not.toThrow();
  });

  it('is backward compatible with btoa for ASCII input', () => {
    const input = 'plain-ascii-kubeconfig';
    expect(encodeBase64(input)).toBe(btoa(input));
  });
});
