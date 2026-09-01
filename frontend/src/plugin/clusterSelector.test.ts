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

import { matchesClusterSelector } from './clusterSelector';

describe('matchesClusterSelector', () => {
  it('returns true for an undefined selector', () => {
    expect(matchesClusterSelector(undefined, { tenant: 'a' })).toBe(true);
  });

  it('returns true for a null selector', () => {
    expect(matchesClusterSelector(null, { tenant: 'a' })).toBe(true);
  });

  it('returns true for an empty selector', () => {
    expect(matchesClusterSelector('', { tenant: 'a' })).toBe(true);
  });

  it('returns true for a whitespace-only selector', () => {
    expect(matchesClusterSelector('   ', { tenant: 'a' })).toBe(true);
  });

  it('returns true when labels are undefined (permissive default)', () => {
    expect(matchesClusterSelector('tenant=a', undefined)).toBe(true);
  });

  it('returns true when labels are null (permissive default)', () => {
    expect(matchesClusterSelector('tenant=a', null)).toBe(true);
  });

  it('returns true for a single matching key=value pair', () => {
    expect(matchesClusterSelector('tenant=a', { tenant: 'a' })).toBe(true);
  });

  it('returns true when all key=value pairs in a multi-key selector match', () => {
    expect(
      matchesClusterSelector('tenant=a,has-velero=true', { tenant: 'a', 'has-velero': 'true' })
    ).toBe(true);
  });

  it('returns true when labels contain extra keys beyond the selector', () => {
    expect(matchesClusterSelector('tenant=a', { tenant: 'a', environment: 'prod' })).toBe(true);
  });

  it('returns false when a selector key is missing from labels', () => {
    expect(matchesClusterSelector('tenant=a', { environment: 'prod' })).toBe(false);
  });

  it('returns false when a selector value does not match', () => {
    expect(matchesClusterSelector('tenant=a', { tenant: 'b' })).toBe(false);
  });

  it('returns false when only one of several key=value pairs matches', () => {
    expect(
      matchesClusterSelector('tenant=a,has-velero=true', { tenant: 'a', 'has-velero': 'false' })
    ).toBe(false);
  });

  it('returns false for a non-empty selector against an empty labels object', () => {
    expect(matchesClusterSelector('tenant=a', {})).toBe(false);
  });

  it('tolerates whitespace around keys, values, and commas', () => {
    expect(
      matchesClusterSelector(' tenant = a , has-velero = true ', {
        tenant: 'a',
        'has-velero': 'true',
      })
    ).toBe(true);
  });

  it('returns false for an unsupported set-based term (no "=")', () => {
    expect(matchesClusterSelector('tenant', { tenant: 'a' })).toBe(false);
  });

  it('returns false for a selector that is only a comma, even against fully matching labels', () => {
    expect(matchesClusterSelector(',', { tenant: 'a' })).toBe(false);
  });

  it('returns false for a trailing comma, even when the other term matches', () => {
    expect(matchesClusterSelector('tenant=a,', { tenant: 'a' })).toBe(false);
  });

  it('returns false for a leading comma, even when the other term matches', () => {
    expect(matchesClusterSelector(',tenant=a', { tenant: 'a' })).toBe(false);
  });

  it('returns false for a double comma between two otherwise-matching terms', () => {
    expect(
      matchesClusterSelector('tenant=a,,has-velero=true', { tenant: 'a', 'has-velero': 'true' })
    ).toBe(false);
  });
});
