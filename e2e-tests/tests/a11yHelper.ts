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

import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Scans a page for serious accessibility violations.
 *
 * Region exclusions apply only to the landmark rule so excluded elements remain
 * covered by every other accessibility check. When exclusions are supplied, all
 * violations from the isolated landmark scan are enforced regardless of impact.
 *
 * @param page - Playwright page to scan.
 * @param expectFn - Playwright assertion function used to report violations.
 * @param regionExclusions - Selectors omitted only from the landmark region rule.
 * @returns A promise that resolves after the scan assertion completes.
 */
export async function runA11yScan(
  page: Page,
  expectFn: typeof import('@playwright/test').expect,
  regionExclusions: string[] = []
): Promise<void> {
  type AxeViolations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];
  const seriousViolations = (violations: AxeViolations) =>
    violations.filter(v => v.impact === 'critical' || v.impact === 'serious');

  let violations: AxeViolations;
  if (regionExclusions.length === 0) {
    violations = seriousViolations((await new AxeBuilder({ page }).analyze()).violations);
  } else {
    const nonRegionResults = await new AxeBuilder({ page }).disableRules(['region']).analyze();
    const regionBuilder = regionExclusions.reduce(
      (builder, selector) => builder.exclude(selector),
      new AxeBuilder({ page }).withRules(['region'])
    );
    const regionResults = await regionBuilder.analyze();
    violations = [...seriousViolations(nonRegionResults.violations), ...regionResults.violations];
  }

  const violationSummary = violations
    .map(
      v =>
        `[${v.id}] (${v.impact}): ${v.help}\n` +
        `  - Targets: ${v.nodes.map(n => n.target.join(', ')).join('\n  - ')}`
    )
    .join('\n\n');
  const violationType =
    regionExclusions.length === 0 ? 'critical/serious accessibility' : 'accessibility';
  const violationNoun = violations.length === 1 ? 'violation' : 'violations';

  expectFn(
    violations,
    `Found ${violations.length} ${violationType} ${violationNoun}:\n\n${violationSummary}`
  ).toEqual([]);
}
