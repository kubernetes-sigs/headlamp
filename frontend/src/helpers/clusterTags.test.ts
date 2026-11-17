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
import { loadClusterSettings, storeClusterSettings } from './clusterSettings';
import {
  CLUSTER_TAGS_CHANGED_EVENT,
  collectClusterTagOptions,
  getInvalidTagKeys,
  isValidTagKey,
  isValidTagValue,
  loadClusterTags,
  matchesClusterTagFilters,
  parseClusterTagFilter,
  sanitizeClusterTags,
  storeClusterTags,
} from './clusterTags';

describe('clusterTags', () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe('validation', () => {
    it.each(['environment', 'app.kubernetes.io/name', 'example.com/team', 'a', 'A_b-c.d'])(
      'accepts the tag key %s',
      key => {
        expect(isValidTagKey(key)).toBe(true);
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
    ])('rejects the tag key "%s"', key => {
      expect(isValidTagKey(key)).toBe(false);
    });

    it.each(['', 'production', 'eu-west-1', 'v1.2_3'])('accepts the label value "%s"', value => {
      expect(isValidTagValue(value)).toBe(true);
    });

    it.each(['-prod', 'prod.', 'has space', 'a/b', 'x'.repeat(64)])(
      'rejects the label value "%s"',
      value => {
        expect(isValidTagValue(value)).toBe(false);
      }
    );

    it('lists the keys of invalid tags', () => {
      expect(getInvalidTagKeys({ ok: 'yes', 'bad key': 'x', bad: 'no way' })).toEqual([
        'bad key',
        'bad',
      ]);
    });
  });

  it('drops malformed tags read from storage', () => {
    expect(sanitizeClusterTags(null)).toEqual({});
    expect(sanitizeClusterTags(['env'])).toEqual({});
    expect(sanitizeClusterTags({ env: 'prod', count: 3, 'bad key': 'x' })).toEqual({
      env: 'prod',
    });
  });

  it('reads context tags after a display-name change without local settings', () => {
    expect(
      loadClusterTags('renamed', {
        name: 'renamed',
        auth_type: '',
        meta_data: {
          extensions: { headlamp_info: { customName: 'renamed', tags: { env: 'prod' } } },
        },
      })
    ).toEqual({ env: 'prod' });
  });

  it('uses an explicit empty local override instead of restoring imported tags', () => {
    storeClusterTags('prod', {});
    expect(
      loadClusterTags('prod', {
        name: 'prod',
        auth_type: '',
        meta_data: { extensions: { headlamp_info: { tags: { env: 'prod' } } } },
      })
    ).toEqual({});
  });

  it('stores tags alongside other cluster settings and notifies listeners', () => {
    storeClusterSettings('prod', { appearance: { accentColor: '#ff0000' } });
    const listener = vi.fn();
    window.addEventListener(CLUSTER_TAGS_CHANGED_EVENT, listener);

    storeClusterTags('prod', { environment: 'production' });

    window.removeEventListener(CLUSTER_TAGS_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadClusterTags('prod')).toEqual({ environment: 'production' });
    expect(loadClusterSettings('prod').appearance).toEqual({ accentColor: '#ff0000' });
  });

  it('keeps an explicit empty local override when all tags are cleared', () => {
    storeClusterTags('prod', { environment: 'production' });
    storeClusterTags('prod', {});

    expect(loadClusterSettings('prod').tags).toEqual({});
  });

  it('refuses to store invalid tags', () => {
    expect(() => storeClusterTags('prod', { 'bad key': 'x' })).toThrow('bad key');
    expect(loadClusterTags('prod')).toEqual({});
  });

  it('parses key=value filters', () => {
    expect(parseClusterTagFilter('environment=production')).toEqual({
      key: 'environment',
      value: 'production',
    });
    expect(parseClusterTagFilter('tier=')).toEqual({ key: 'tier', value: '' });
    expect(parseClusterTagFilter('environment')).toBeNull();
    expect(parseClusterTagFilter('=production')).toBeNull();
    expect(parseClusterTagFilter('bad key=x')).toBeNull();
  });

  describe('matchesClusterTagFilters', () => {
    const tags = { environment: 'production', region: 'eu-west' };

    it('matches everything without filters', () => {
      expect(matchesClusterTagFilters({}, [])).toBe(true);
    });

    it('requires every key to match', () => {
      expect(
        matchesClusterTagFilters(tags, [
          { key: 'environment', value: 'production' },
          { key: 'region', value: 'eu-west' },
        ])
      ).toBe(true);
      expect(
        matchesClusterTagFilters(tags, [
          { key: 'environment', value: 'production' },
          { key: 'region', value: 'us-east' },
        ])
      ).toBe(false);
    });

    it('treats values for the same key as alternatives', () => {
      expect(
        matchesClusterTagFilters(tags, [
          { key: 'environment', value: 'staging' },
          { key: 'environment', value: 'production' },
        ])
      ).toBe(true);
    });

    it('does not match clusters missing the key', () => {
      expect(matchesClusterTagFilters(tags, [{ key: 'team', value: '' }])).toBe(false);
    });
  });

  it('collects sorted tag keys and pairs', () => {
    expect(
      collectClusterTagOptions({
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
