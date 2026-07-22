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

export async function runA11yScan(page: Page, expectFn: typeof import('@playwright/test').expect) {
  const axeBuilder = new AxeBuilder({ page });
  const accessibilityResults = await axeBuilder.analyze();

  // Filter for critical and serious violations only for improved test stability
  const violations = accessibilityResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );

  const violationSummary = violations
    .map(
      v =>
        `[${v.id}] (${v.impact}): ${v.help}\n` +
        `  - Targets: ${v.nodes.map(n => n.target.join(', ')).join('\n  - ')}`
    )
    .join('\n\n');

  expectFn(
    violations,
    `Found ${violations.length} critical/serious accessibility violations:\n\n${violationSummary}`
  ).toEqual([]);
}
