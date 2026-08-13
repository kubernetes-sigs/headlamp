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

import { validateLabelSelector } from './labelSelectorValidation';

describe('validateLabelSelector', () => {
  it.each([
    '',
    'app=nginx',
    'app==nginx',
    'tier!=backend',
    'env in (production,staging)',
    'env notin (dev,test)',
    'environment in (production),tier in (frontend)',
    'env in (production,,staging)',
    'env in (production,,,,staging,,)',
    'env notin ()',
    'env in (in,notin)',
    'generation>2',
    'generation<10',
    'generation<009',
    'generation<9223372036854775807',
    'partition',
    '!partition',
    'app.kubernetes.io/name=checkout-api,environment=production,tier!=backend',
    'empty-label=',
  ])('accepts %s', selector => {
    expect(validateLabelSelector(selector)).toBeNull();
  });

  it.each([
    ['app in (', 'parentheses must be balanced'],
    ['app=nginx,', 'requirements must not be empty'],
    ['bad key=value', 'invalid label key "bad key"'],
    ['app=bad value', 'invalid label value "bad value"'],
    ['generation>current', 'greater-than and less-than selectors require an integer value'],
    [
      'generation>9223372036854775808',
      'greater-than and less-than selectors require an integer value',
    ],
    ['app=nginx||tier=frontend', 'invalid label value "nginx||tier=frontend"'],
    ['!bad key', 'invalid requirement "!bad key"'],
  ])('rejects %s', (selector, error) => {
    expect(validateLabelSelector(selector)).toBe(error);
  });
});
