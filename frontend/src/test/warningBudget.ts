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

export interface WarningCategory {
  name: string;
  pattern: RegExp;
  budget: number;
}

// Initial generous budgets, to be adjusted after first run
export const knownCategories: WarningCategory[] = [
  { name: 'I18N_MISSING', pattern: /NO_I18NEXT_INSTANCE/i, budget: 200 },
  { name: 'WEBSOCKET_ERROR', pattern: /WebSocket error:|Socket closed unexpectedly/i, budget: 400 },
  { name: 'DOM_NESTING', pattern: /validateDOMNesting/i, budget: 200 },
  { name: 'ACT_WARNING', pattern: /act\(\.\.\.\)/i, budget: 200 },
  { name: 'MUI_TOOLTIP', pattern: /MUI: Tooltip/i, budget: 100 },
];

export const warningCounts: Record<string, number> = {};

export function setupWarningBudget() {
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  const intercept =
    (originalFn: (...args: any[]) => void) =>
    (...args: any[]) => {
      const message = args.map(arg => (typeof arg === 'string' ? arg : String(arg))).join(' ');

      for (const category of knownCategories) {
        if (category.pattern.test(message)) {
          warningCounts[category.name] = (warningCounts[category.name] || 0) + 1;
          break;
        }
      }

      // Always log it to the console as usual so we don't hide information
      originalFn(...args);
    };

  console.warn = intercept(originalConsoleWarn);
  console.error = intercept(originalConsoleError);
}

export function assertWarningBudget() {
  // Only enforce if we explicitly opted in, or just enforce always (let's enforce always since we have a generous budget)
  const overBudget: string[] = [];

  for (const category of knownCategories) {
    const count = warningCounts[category.name] || 0;
    if (count > category.budget) {
      overBudget.push(`${category.name}: allowed ${category.budget}, got ${count}`);
    }
    // Also print out the actual counts so developers know how far below budget they are
    console.log(`[Warning Budget] ${category.name}: ${count}/${category.budget}`);
  }

  if (overBudget.length > 0) {
    throw new Error(
      `Warning budget exceeded for the following categories:\n${overBudget.join('\n')}`
    );
  }
}
