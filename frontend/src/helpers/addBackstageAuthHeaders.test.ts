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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addBackstageAuthHeaders } from './addBackstageAuthHeaders';

const BACKSTAGE_TOKEN_STORAGE_KEY = 'backstage_token';

describe('addBackstageAuthHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns the original headers unchanged when no backstage token is stored', () => {
    const plainHeaders = { 'Content-Type': 'application/json' };
    const tupleHeaders: [string, string][] = [['Accept', 'application/json']];
    const headersObj = new Headers({ Authorization: 'Bearer k8s-token' });

    expect(addBackstageAuthHeaders(plainHeaders)).toBe(plainHeaders);
    expect(addBackstageAuthHeaders(tupleHeaders)).toBe(tupleHeaders);
    expect(addBackstageAuthHeaders(headersObj)).toBe(headersObj);
    expect(addBackstageAuthHeaders()).toEqual({});
  });

  it('adds X-BACKSTAGE-TOKEN when no headers are passed', () => {
    localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, 'bs-token-1');

    expect(addBackstageAuthHeaders()).toEqual({
      'X-BACKSTAGE-TOKEN': 'bs-token-1',
    });
  });

  it('clones a Headers instance and sets X-BACKSTAGE-TOKEN without mutating input', () => {
    localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, 'bs-token-2');
    const original = new Headers({
      'Content-Type': 'application/json',
      'x-backstage-token': 'stale-token',
    });

    const result = addBackstageAuthHeaders(original);

    expect(result).toBeInstanceOf(Headers);
    expect(result).not.toBe(original);
    expect((result as Headers).get('Content-Type')).toBe('application/json');
    expect((result as Headers).get('X-BACKSTAGE-TOKEN')).toBe('bs-token-2');
    expect(original.get('X-BACKSTAGE-TOKEN')).toBe('stale-token');
  });

  it('preserves tuple-array HeadersInit entries instead of spreading into an object', () => {
    localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, 'bs-token-3');
    const original: [string, string][] = [
      ['Authorization', 'Bearer k8s-token'],
      ['Content-Type', 'application/json'],
      ['x-backstage-token', 'stale-token'],
    ];

    const result = addBackstageAuthHeaders(original);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      ['Authorization', 'Bearer k8s-token'],
      ['Content-Type', 'application/json'],
      ['X-BACKSTAGE-TOKEN', 'bs-token-3'],
    ]);

    const parsed = new Headers(result);
    expect(parsed.get('Authorization')).toBe('Bearer k8s-token');
    expect(parsed.get('Content-Type')).toBe('application/json');
    expect(parsed.get('X-BACKSTAGE-TOKEN')).toBe('bs-token-3');
    expect(original).toHaveLength(3);
  });

  it('copies a plain object header map and sets X-BACKSTAGE-TOKEN without mutating input', () => {
    localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, 'bs-token-4');
    const original = { Accept: 'application/json' };

    const result = addBackstageAuthHeaders(original);

    expect(result).toEqual({
      Accept: 'application/json',
      'X-BACKSTAGE-TOKEN': 'bs-token-4',
    });
    expect(original).toEqual({ Accept: 'application/json' });
  });
});
