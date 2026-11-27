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
import {
  getClusterAppearanceFromMeta,
  isValidCssColor,
  sanitizeCssColor,
} from './clusterAppearance';
import { storeClusterSettings } from './clusterSettings';

describe('clusterAppearance', () => {
  const originalPath = window.location.pathname + window.location.search + window.location.hash;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', originalPath || '/');
  });

  describe('isValidCssColor', () => {
    it.each([
      '#abc',
      '#a1b2c3',
      '#ABCDEF',
      'rgb(0,0,0)',
      'rgb(10, 20, 30)',
      'rgba(10, 20, 30, 0)',
      'rgba(10, 20, 30, 1)',
      'rgba(10, 20, 30, 0.5)',
      'rgba(10, 20, 30, .5)',
    ])('accepts valid CSS color %s', color => {
      expect(isValidCssColor(color)).toBe(true);
    });

    it.each([
      '',
      'red',
      '#12',
      '#12345',
      '#12345678',
      '#gggggg',
      'rgb(10, 20)',
      'rgba(10, 20, 30, 1.5)',
      'rgba(10, 20, 30, -0.5)',
      'hsl(120, 100%, 50%)',
      '#fff; background: url(https://evil.example)',
    ])('rejects invalid CSS color %s', color => {
      expect(isValidCssColor(color)).toBe(false);
    });
  });

  describe('sanitizeCssColor', () => {
    it('returns valid CSS colors unchanged', () => {
      expect(sanitizeCssColor('#336699')).toBe('#336699');
      expect(sanitizeCssColor('rgba(1, 2, 3, 0.75)')).toBe('rgba(1, 2, 3, 0.75)');
    });

    it.each([null, undefined, 42, {}, '', 'rebeccapurple', 'javascript:alert(1)'])(
      'returns undefined for non-string or invalid value %p',
      value => {
        expect(sanitizeCssColor(value)).toBeUndefined();
      }
    );
  });

  describe('getClusterAppearanceFromMeta', () => {
    it('returns an empty object when clusterName is null or empty', () => {
      expect(getClusterAppearanceFromMeta(null)).toEqual({});
      expect(getClusterAppearanceFromMeta('')).toEqual({});
    });

    it('returns an empty object when no appearance settings are stored', () => {
      expect(getClusterAppearanceFromMeta('missing-cluster')).toEqual({});
    });

    it('returns sanitized accentColor and icon stored for the cluster', () => {
      storeClusterSettings('prod-cluster', {
        appearance: {
          accentColor: '#1976d2',
          icon: 'mdi:kubernetes',
        },
      });

      expect(getClusterAppearanceFromMeta('prod-cluster')).toEqual({
        accentColor: '#1976d2',
        icon: 'mdi:kubernetes',
      });
    });

    it('drops invalid accentColor and non-string icon while preserving valid fields', () => {
      storeClusterSettings('malformed-cluster', {
        appearance: {
          accentColor: 'expression(alert(1))',
          icon: 123 as unknown as string,
        },
      });

      expect(getClusterAppearanceFromMeta('malformed-cluster')).toEqual({
        accentColor: undefined,
        icon: undefined,
      });

      storeClusterSettings('partial-cluster', {
        appearance: {
          accentColor: 'invalid-color',
          icon: 'mdi:cloud',
        },
      });

      expect(getClusterAppearanceFromMeta('partial-cluster')).toEqual({
        accentColor: undefined,
        icon: 'mdi:cloud',
      });
    });

    it('uses the current cluster from window.location when clusterName is omitted', () => {
      storeClusterSettings('url-cluster', {
        appearance: {
          accentColor: 'rgb(12, 34, 56)',
          icon: 'mdi:server',
        },
      });

      window.history.replaceState({}, '', '/c/url-cluster/pods');

      expect(getClusterAppearanceFromMeta()).toEqual({
        accentColor: 'rgb(12, 34, 56)',
        icon: 'mdi:server',
      });
    });
  });
});
