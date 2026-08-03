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

import { matchesLabelSelector } from './labelSelector';

const podLabels = { app: 'web', tier: 'frontend', env: 'prod' };

describe('matchesLabelSelector', () => {
  describe('empty and absent selectors match everything', () => {
    it.each([undefined, {}, { matchLabels: {} }, { matchExpressions: [] }])(
      'matches for selector %j',
      selector => {
        expect(matchesLabelSelector(podLabels, selector)).toBe(true);
        expect(matchesLabelSelector({}, selector)).toBe(true);
        expect(matchesLabelSelector(undefined, selector)).toBe(true);
      }
    );
  });

  describe('matchLabels (AND of equalities)', () => {
    it('matches when every key/value is present', () => {
      expect(
        matchesLabelSelector(podLabels, { matchLabels: { app: 'web', tier: 'frontend' } })
      ).toBe(true);
    });

    it('does not match when a value differs', () => {
      expect(matchesLabelSelector(podLabels, { matchLabels: { app: 'api' } })).toBe(false);
    });

    it('does not match when a key is missing', () => {
      expect(matchesLabelSelector(podLabels, { matchLabels: { team: 'payments' } })).toBe(false);
    });

    it('does not match labels that are undefined', () => {
      expect(matchesLabelSelector(undefined, { matchLabels: { app: 'web' } })).toBe(false);
    });
  });

  describe('matchExpressions operators', () => {
    it('In matches when the value is in the set', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'tier', operator: 'In', values: ['frontend', 'backend'] }],
        })
      ).toBe(true);
    });

    it('In does not match when the value is absent or not in the set', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'tier', operator: 'In', values: ['backend'] }],
        })
      ).toBe(false);
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'missing', operator: 'In', values: ['x'] }],
        })
      ).toBe(false);
    });

    it('NotIn matches when the value is not in the set, including a missing key', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['backend'] }],
        })
      ).toBe(true);
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'missing', operator: 'NotIn', values: ['x'] }],
        })
      ).toBe(true);
    });

    it('NotIn does not match when the value is in the set', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['frontend'] }],
        })
      ).toBe(false);
    });

    it('Exists and DoesNotExist check key presence', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'app', operator: 'Exists', values: [] }],
        })
      ).toBe(true);
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'canary', operator: 'Exists', values: [] }],
        })
      ).toBe(false);
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'canary', operator: 'DoesNotExist', values: [] }],
        })
      ).toBe(true);
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'app', operator: 'DoesNotExist', values: [] }],
        })
      ).toBe(false);
    });

    it('fails closed on an unknown operator', () => {
      expect(
        matchesLabelSelector(podLabels, {
          matchExpressions: [{ key: 'app', operator: 'Contains', values: ['web'] }],
        })
      ).toBe(false);
    });
  });

  describe('combined criteria are ANDed', () => {
    it('matches only when matchLabels and every expression hold', () => {
      const selector = {
        matchLabels: { env: 'prod' },
        matchExpressions: [
          { key: 'tier', operator: 'In', values: ['frontend'] },
          { key: 'canary', operator: 'DoesNotExist', values: [] },
        ],
      };
      expect(matchesLabelSelector(podLabels, selector)).toBe(true);
      expect(matchesLabelSelector({ ...podLabels, canary: 'true' }, selector)).toBe(false);
      expect(matchesLabelSelector({ ...podLabels, env: 'dev' }, selector)).toBe(false);
    });
  });
});
