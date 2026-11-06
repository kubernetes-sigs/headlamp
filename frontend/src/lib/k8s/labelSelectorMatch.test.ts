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

import { matchesLabelSelector } from './labelSelectorMatch';

describe('matchesLabelSelector', () => {
  it('matches everything when the selector is undefined', () => {
    expect(matchesLabelSelector(undefined, undefined)).toBe(true);
    expect(matchesLabelSelector({ foo: 'bar' }, undefined)).toBe(true);
  });

  it('matches everything when the selector is empty or blank', () => {
    expect(matchesLabelSelector({ foo: 'bar' }, '')).toBe(true);
    expect(matchesLabelSelector({ foo: 'bar' }, '   ')).toBe(true);
    expect(matchesLabelSelector(undefined, '')).toBe(true);
  });

  it('handles undefined labels with a non-empty selector', () => {
    expect(matchesLabelSelector(undefined, 'foo=bar')).toBe(false);
    expect(matchesLabelSelector(undefined, 'foo!=bar')).toBe(true);
    expect(matchesLabelSelector(undefined, '!foo')).toBe(true);
    expect(matchesLabelSelector(undefined, 'foo')).toBe(false);
  });

  describe('equality operator', () => {
    it('matches key=value', () => {
      expect(matchesLabelSelector({ foo: 'bar' }, 'foo=bar')).toBe(true);
      expect(matchesLabelSelector({ foo: 'baz' }, 'foo=bar')).toBe(false);
      expect(matchesLabelSelector({}, 'foo=bar')).toBe(false);
    });

    it('matches key==value', () => {
      expect(matchesLabelSelector({ foo: 'bar' }, 'foo==bar')).toBe(true);
      expect(matchesLabelSelector({ foo: 'baz' }, 'foo==bar')).toBe(false);
    });

    it('tolerates whitespace around the operator', () => {
      expect(matchesLabelSelector({ foo: 'bar' }, ' foo = bar ')).toBe(true);
      expect(matchesLabelSelector({ foo: 'bar' }, 'foo  ==  bar')).toBe(true);
    });
  });

  describe('inequality operator', () => {
    it('matches when the value differs', () => {
      expect(matchesLabelSelector({ foo: 'baz' }, 'foo!=bar')).toBe(true);
      expect(matchesLabelSelector({ foo: 'bar' }, 'foo!=bar')).toBe(false);
    });

    it('matches when the key is absent (apiserver behavior)', () => {
      expect(matchesLabelSelector({}, 'foo!=bar')).toBe(true);
      expect(matchesLabelSelector({ other: 'x' }, 'foo!=bar')).toBe(true);
    });

    it('tolerates whitespace', () => {
      expect(matchesLabelSelector({ foo: 'baz' }, ' foo != bar ')).toBe(true);
    });
  });

  describe('exists operator', () => {
    it('matches when the key is present regardless of value', () => {
      expect(matchesLabelSelector({ foo: 'anything' }, 'foo')).toBe(true);
      expect(matchesLabelSelector({}, 'foo')).toBe(false);
    });

    it('tolerates surrounding whitespace', () => {
      expect(matchesLabelSelector({ foo: 'bar' }, '  foo  ')).toBe(true);
    });
  });

  describe('does-not-exist operator', () => {
    it('matches when the key is absent', () => {
      expect(matchesLabelSelector({}, '!foo')).toBe(true);
      expect(matchesLabelSelector({ foo: 'bar' }, '!foo')).toBe(false);
    });

    it('tolerates whitespace after the !', () => {
      expect(matchesLabelSelector({}, '! foo')).toBe(true);
      expect(matchesLabelSelector({}, '  !foo  ')).toBe(true);
    });
  });

  describe('in operator', () => {
    it('matches when the value is a member of the set', () => {
      expect(matchesLabelSelector({ foo: 'a' }, 'foo in (a,b,c)')).toBe(true);
      expect(matchesLabelSelector({ foo: 'z' }, 'foo in (a,b,c)')).toBe(false);
      expect(matchesLabelSelector({}, 'foo in (a,b,c)')).toBe(false);
    });

    it('tolerates whitespace around members and parens', () => {
      expect(matchesLabelSelector({ foo: 'b' }, 'foo in ( a , b , c )')).toBe(true);
      expect(matchesLabelSelector({ foo: 'b' }, 'foo  in  (a,b,c)')).toBe(true);
    });
  });

  describe('notin operator', () => {
    it('matches when the value is not a member of the set', () => {
      expect(matchesLabelSelector({ foo: 'z' }, 'foo notin (a,b,c)')).toBe(true);
      expect(matchesLabelSelector({ foo: 'a' }, 'foo notin (a,b,c)')).toBe(false);
    });

    it('matches when the key is absent', () => {
      expect(matchesLabelSelector({}, 'foo notin (a,b,c)')).toBe(true);
    });

    it('tolerates whitespace', () => {
      expect(matchesLabelSelector({ foo: 'z' }, 'foo  notin  ( a , b , c )')).toBe(true);
    });
  });

  describe('multiple ANDed requirements', () => {
    it('requires every requirement to hold', () => {
      const labels = { env: 'prod', tier: 'backend' };
      expect(matchesLabelSelector(labels, 'env=prod,tier=backend')).toBe(true);
      expect(matchesLabelSelector(labels, 'env=prod,tier=frontend')).toBe(false);
      expect(matchesLabelSelector(labels, 'env=prod, tier in (backend,frontend), !missing')).toBe(
        true
      );
    });

    it('tolerates whitespace between requirements', () => {
      expect(
        matchesLabelSelector({ env: 'prod', tier: 'backend' }, ' env=prod , tier=backend ')
      ).toBe(true);
    });
  });

  describe('empty label values', () => {
    it.each(['foo=', 'foo==', 'foo = ', 'foo in ()', 'foo in ( ,a)', 'foo in (a, )'])(
      'matches an empty value with %s but not an absent key',
      selector => {
        expect(matchesLabelSelector({ foo: '' }, selector)).toBe(true);
        expect(matchesLabelSelector({ foo: 'other' }, selector)).toBe(false);
        expect(matchesLabelSelector({}, selector)).toBe(false);
      }
    );

    it.each(['foo!=', 'foo != ', 'foo notin ()', 'foo notin (,a)', 'foo notin (a, )'])(
      'excludes an empty value with %s but includes an absent key',
      selector => {
        expect(matchesLabelSelector({ foo: '' }, selector)).toBe(false);
        expect(matchesLabelSelector({ foo: 'other' }, selector)).toBe(true);
        expect(matchesLabelSelector({}, selector)).toBe(true);
      }
    );
  });

  describe('qualified label keys', () => {
    it.each([
      'Name_1.example',
      'example.com/Name_1',
      'a'.repeat(63),
      `${'a'.repeat(253)}/${'b'.repeat(63)}`,
    ])('accepts a valid key %s', key => {
      expect(matchesLabelSelector({ [key]: 'value' }, `${key}=value`)).toBe(true);
      expect(matchesLabelSelector({}, `!${key}`)).toBe(true);
    });

    it.each([
      'foo//bar',
      'example.com/name/extra',
      '/name',
      'example.com/',
      'Example.com/name',
      'example_com/name',
      'example..com/name',
      '-example.com/name',
      'example-.com/name',
      'a'.repeat(64),
      `example.com/${'a'.repeat(64)}`,
      `${'a'.repeat(254)}/name`,
    ])('fails closed for an invalid key %s in every operator', key => {
      expect(matchesLabelSelector({ [key]: 'value' }, key)).toBe(false);
      expect(matchesLabelSelector({ [key]: 'value' }, `${key}=value`)).toBe(false);
      expect(matchesLabelSelector({ [key]: 'value' }, `${key} in (value)`)).toBe(false);
      expect(matchesLabelSelector({}, `!${key}`)).toBe(false);
      expect(matchesLabelSelector({}, `${key}!=value`)).toBe(false);
      expect(matchesLabelSelector({}, `${key} notin (value)`)).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('fails closed without throwing on an unbalanced set', () => {
      expect(() => matchesLabelSelector({ foo: 'a' }, 'foo in (a,b')).not.toThrow();
      expect(matchesLabelSelector({ foo: 'a' }, 'foo in (a,b')).toBe(false);
    });

    it('fails closed without throwing on a stray operator', () => {
      expect(() => matchesLabelSelector({ foo: 'a' }, 'foo===bar')).not.toThrow();
      expect(matchesLabelSelector({ foo: 'a' }, 'foo===bar')).toBe(false);
    });

    it('fails closed on an empty requirement produced by a stray comma', () => {
      expect(matchesLabelSelector({ foo: 'a' }, 'foo=a,,bar=b')).toBe(false);
    });
  });
});
