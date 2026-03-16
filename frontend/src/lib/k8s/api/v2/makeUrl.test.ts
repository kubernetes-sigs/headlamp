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
import { makeUrl } from './makeUrl';

describe('makeUrl', () => {
  it('should create a URL from parts without query parameters', () => {
    const urlParts = ['http://example.com', 'path', 'to', 'resource'];
    const result = makeUrl(urlParts);
    expect(result).toBe('http://example.com/path/to/resource');
  });

  it('should create a URL from parts with query parameters', () => {
    const urlParts = ['http://example.com', 'path', 'to', 'resource'];
    const query = { key1: 'value1', key2: 'value2' };
    const result = makeUrl(urlParts, query);
    expect(result).toBe('http://example.com/path/to/resource?key1=value1&key2=value2');
  });

  it('should handle empty urlParts', () => {
    const urlParts: any[] = [];
    const result = makeUrl(urlParts);
    expect(result).toBe('');
  });

  it('should handle empty query parameters', () => {
    const urlParts = ['http://example.com', 'path', 'to', 'resource'];
    const query = {};
    const result = makeUrl(urlParts, query);
    expect(result).toBe('http://example.com/path/to/resource');
  });

  it('should replace multiple slashes with a single one', () => {
    const urlParts = ['http://example.com/', '/path/', '/to/', '/resource'];
    const result = makeUrl(urlParts);
    expect(result).toBe('http://example.com/path/to/resource');
  });

  it('should handle special characters in query parameters', () => {
    const urlParts = ['http://example.com', 'path', 'to', 'resource'];
    const query = {
      'key with spaces': 'value with spaces',
      'key&with&special&chars': 'value&with&special&chars',
    };
    const result = makeUrl(urlParts, query);
    expect(result).toBe(
      'http://example.com/path/to/resource?key+with+spaces=value+with+spaces&key%26with%26special%26chars=value%26with%26special%26chars'
    );
  });

  it('should handle numeric and boolean values in urlParts', () => {
    const urlParts = ['http://example.com', 123, true, 'resource'];
    const result = makeUrl(urlParts);
    expect(result).toBe('http://example.com/123/true/resource');
  });

  it('should create a url from a single string', () => {
    expect(makeUrl('http://example.com/some/path', { watch: 1 })).toBe(
      'http://example.com/some/path?watch=1'
    );
  });
});
