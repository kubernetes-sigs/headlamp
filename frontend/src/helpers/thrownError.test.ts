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
import { getThrownMessage, toError } from './thrownError';

describe('getThrownMessage', () => {
  it('reads the message of an Error', () => {
    expect(getThrownMessage(new Error('boom'))).toBe('boom');
  });

  it('reads the message of a non-Error object that carries one', () => {
    expect(getThrownMessage({ status: 403, message: 'forbidden' })).toBe('forbidden');
  });

  it('returns a thrown string as-is', () => {
    expect(getThrownMessage('plain failure')).toBe('plain failure');
  });

  it('returns an empty string when there is no message', () => {
    expect(getThrownMessage({ status: 500 })).toBe('');
    expect(getThrownMessage(null)).toBe('');
    expect(getThrownMessage(undefined)).toBe('');
    expect(getThrownMessage({ message: 42 })).toBe('');
  });
});

describe('toError', () => {
  it('returns the same Error instance', () => {
    const error = new Error('boom');

    expect(toError(error)).toBe(error);
  });

  it('keeps the message of a non-Error object', () => {
    expect(toError({ status: 403, message: 'forbidden' }).message).toBe('forbidden');
  });

  it('does not stringify an object into its message', () => {
    expect(toError({ status: 500 }).message).not.toContain('[object Object]');
  });

  it('uses the fallback when there is no message', () => {
    expect(toError({ status: 500 }, 'request failed').message).toBe('request failed');
  });
});
