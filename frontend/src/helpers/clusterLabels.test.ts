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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLUSTER_LABELS_CHANGED_EVENT,
  collectClusterLabelOptions,
  getInvalidLabelKeys,
  isValidLabelKey,
  isValidLabelValue,
  loadClusterLabels,
  matchesClusterLabelFilters,
  parseClusterLabelFilter,
  sanitizeClusterLabels,
  storeClusterLabels,
} from './clusterLabels';
import { loadClusterSettings, storeClusterSettings } from './clusterSettings';

describe('clusterLabels', () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe('validation', () => {
    it.each(['environment', 'app.kubernetes.io/name', 'example.com/team', 'a', 'A_b-c.d'])(
      'accepts the label key %s',
      key => {
        expect(isValidLabelKey(key)).toBe(true);
      }
    );

    it.each([
      '',
      '-env',
      'env-',
      'a/b/c',
      '/env',
      'Example.com/env',
      'has space',
      'x'.repeat(64),
      `${'a'.repeat(254)}/env`,
    ])('rejects the label key "%s"', key => {
      expect(isValidLabelKey(key)).toBe(false);
    });

    it.each(['', 'production', 'eu-west-1', 'v1.2_3'])('accepts the label value "%s"', value => {
      expect(isValidLabelValue(value)).toBe(true);
    });

    it.each(['-prod', 'prod.', 'has space', 'a/b', 'x'.repeat(64)])(
      'rejects the label value "%s"',
      value => {
        expect(isValidLabelValue(value)).toBe(false);
      }
    );

    it('lists the keys of invalid labels', () => {
      expect(getInvalidLabelKeys({ ok: 'yes', 'bad key': 'x', bad: 'no way' })).toEqual([
        'bad key',
        'bad',
      ]);
    });
  });

  it('drops malformed labels read from storage', () => {
    expect(sanitizeClusterLabels(null)).toEqual({});
    expect(sanitizeClusterLabels(['env'])).toEqual({});
    expect(sanitizeClusterLabels({ env: 'prod', count: 3, 'bad key': 'x' })).toEqual({
      env: 'prod',
    });
  });

  it('stores labels alongside other cluster settings and notifies listeners', () => {
    storeClusterSettings('prod', { appearance: { accentColor: '#ff0000' } });
    const listener = vi.fn();
    window.addEventListener(CLUSTER_LABELS_CHANGED_EVENT, listener);

    storeClusterLabels('prod', { environment: 'production' });

    window.removeEventListener(CLUSTER_LABELS_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadClusterLabels('prod')).toEqual({ environment: 'production' });
    expect(loadClusterSettings('prod').appearance).toEqual({ accentColor: '#ff0000' });
  });

  it('removes the labels field when all labels are cleared', () => {
    storeClusterLabels('prod', { environment: 'production' });
    storeClusterLabels('prod', {});

    expect(loadClusterSettings('prod')).not.toHaveProperty('labels');
  });

  it('refuses to store invalid labels', () => {
    expect(() => storeClusterLabels('prod', { 'bad key': 'x' })).toThrow('bad key');
    expect(loadClusterLabels('prod')).toEqual({});
  });

  it('parses key=value filters', () => {
    expect(parseClusterLabelFilter('environment=production')).toEqual({
      key: 'environment',
      value: 'production',
    });
    expect(parseClusterLabelFilter('tier=')).toEqual({ key: 'tier', value: '' });
    expect(parseClusterLabelFilter('environment')).toBeNull();
    expect(parseClusterLabelFilter('=production')).toBeNull();
    expect(parseClusterLabelFilter('bad key=x')).toBeNull();
  });

  describe('matchesClusterLabelFilters', () => {
    const labels = { environment: 'production', region: 'eu-west' };

    it('matches everything without filters', () => {
      expect(matchesClusterLabelFilters({}, [])).toBe(true);
    });

    it('requires every key to match', () => {
      expect(
        matchesClusterLabelFilters(labels, [
          { key: 'environment', value: 'production' },
          { key: 'region', value: 'eu-west' },
        ])
      ).toBe(true);
      expect(
        matchesClusterLabelFilters(labels, [
          { key: 'environment', value: 'production' },
          { key: 'region', value: 'us-east' },
        ])
      ).toBe(false);
    });

    it('treats values for the same key as alternatives', () => {
      expect(
        matchesClusterLabelFilters(labels, [
          { key: 'environment', value: 'staging' },
          { key: 'environment', value: 'production' },
        ])
      ).toBe(true);
    });

    it('does not match clusters missing the key', () => {
      expect(matchesClusterLabelFilters(labels, [{ key: 'team', value: '' }])).toBe(false);
    });
  });

  it('collects sorted label keys and pairs', () => {
    expect(
      collectClusterLabelOptions({
        a: { region: 'eu', environment: 'prod' },
        b: { environment: 'dev' },
        c: {},
      })
    ).toEqual({
      keys: ['environment', 'region'],
      pairs: ['environment=dev', 'environment=prod', 'region=eu'],
    });
  });
});
