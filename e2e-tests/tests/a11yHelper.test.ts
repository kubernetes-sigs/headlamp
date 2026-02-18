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

import type { Page } from '@playwright/test';
import type { Result } from 'axe-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runA11yScan } from './a11yHelper';

const { analyze, disableRules, exclude, withRules } = vi.hoisted(() => ({
  analyze: vi.fn(),
  disableRules: vi.fn(),
  exclude: vi.fn(),
  withRules: vi.fn(),
}));

vi.mock('@axe-core/playwright', () => ({
  AxeBuilder: class {
    analyze = analyze;
    disableRules = disableRules.mockReturnValue(this);
    exclude = exclude.mockReturnValue(this);
    withRules = withRules.mockReturnValue(this);
  },
}));

/**
 * Creates an axe violation for accessibility scan tests.
 *
 * @param id - Rule identifier used in the violation details.
 * @param impact - Severity reported by axe.
 * @returns A complete axe violation result.
 */
function makeViolation(id: string, impact: Result['impact']): Result {
  return {
    id,
    impact,
    tags: [],
    description: `${id} description`,
    help: `${id} help`,
    helpUrl: `https://example.com/${id}`,
    nodes: [
      {
        any: [],
        all: [],
        none: [],
        impact,
        html: '<div />',
        target: [`#${id}`],
        failureSummary: undefined,
      },
    ],
  };
}

describe('runA11yScan', () => {
  beforeEach(() => {
    analyze.mockReset();
    disableRules.mockClear();
    exclude.mockClear();
    withRules.mockClear();
  });

  test('reports only critical and serious violations', async () => {
    const criticalViolation = makeViolation('critical-rule', 'critical');
    const seriousViolation = makeViolation('serious-rule', 'serious');
    analyze.mockResolvedValue({
      violations: [
        criticalViolation,
        seriousViolation,
        makeViolation('moderate-rule', 'moderate'),
        makeViolation('minor-rule', 'minor'),
        makeViolation('unknown-rule', null),
      ],
    });
    const toEqual = vi.fn();
    const expectFn = vi.fn(() => ({ toEqual }));

    await runA11yScan({} as Page, expectFn as unknown as typeof import('@playwright/test').expect);

    expect(expectFn).toHaveBeenCalledWith(
      [criticalViolation, seriousViolation],
      'Found 2 critical/serious accessibility violations:\n\n' +
        '[critical-rule] (critical): critical-rule help\n  - Targets: #critical-rule\n\n' +
        '[serious-rule] (serious): serious-rule help\n  - Targets: #serious-rule'
    );
    expect(toEqual).toHaveBeenCalledWith([]);
  });

  test('accepts a scan without violations', async () => {
    analyze.mockResolvedValue({ violations: [] });
    const toEqual = vi.fn();
    const expectFn = vi.fn(() => ({ toEqual }));

    await runA11yScan({} as Page, expectFn as unknown as typeof import('@playwright/test').expect);

    expect(expectFn).toHaveBeenCalledWith(
      [],
      'Found 0 critical/serious accessibility violations:\n\n'
    );
    expect(toEqual).toHaveBeenCalledWith([]);
  });

  test('checks the region rule separately when regions are excluded', async () => {
    const nonRegionViolation = makeViolation('non-region-rule', 'serious');
    const regionViolation = makeViolation('region', 'serious');
    analyze
      .mockResolvedValueOnce({
        violations: [nonRegionViolation, makeViolation('minor-rule', 'minor')],
      })
      .mockResolvedValueOnce({ violations: [regionViolation] });
    const toEqual = vi.fn();
    const expectFn = vi.fn(() => ({ toEqual }));

    await runA11yScan({} as Page, expectFn as unknown as typeof import('@playwright/test').expect, [
      '[role="tooltip"]',
      '#transient-region',
    ]);

    expect(disableRules).toHaveBeenCalledWith(['region']);
    expect(withRules).toHaveBeenCalledWith(['region']);
    expect(exclude).toHaveBeenNthCalledWith(1, '[role="tooltip"]');
    expect(exclude).toHaveBeenNthCalledWith(2, '#transient-region');
    expect(expectFn).toHaveBeenCalledWith(
      [nonRegionViolation, regionViolation],
      'Found 2 accessibility violations:\n\n' +
        '[non-region-rule] (serious): non-region-rule help\n' +
        '  - Targets: #non-region-rule\n\n' +
        '[region] (serious): region help\n  - Targets: #region'
    );
    expect(toEqual).toHaveBeenCalledWith([]);
  });

  test('reports isolated landmark violations regardless of severity', async () => {
    const regionViolation = makeViolation('region', 'moderate');
    analyze
      .mockResolvedValueOnce({ violations: [] })
      .mockResolvedValueOnce({ violations: [regionViolation] });
    const toEqual = vi.fn();
    const expectFn = vi.fn(() => ({ toEqual }));

    await runA11yScan({} as Page, expectFn as unknown as typeof import('@playwright/test').expect, [
      '[role="tooltip"]',
    ]);

    expect(expectFn).toHaveBeenCalledWith(
      [regionViolation],
      'Found 1 accessibility violation:\n\n' +
        '[region] (moderate): region help\n  - Targets: #region'
    );
    expect(toEqual).toHaveBeenCalledWith([]);
  });
});
