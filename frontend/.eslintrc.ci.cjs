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

// ESLint config used by `npm run ci-lint`.
//
// Extends the project's main config from package.json#eslintConfig and
// re-enables every `react-hooks/*` rule as a warning. Combined with
// `--max-warnings 0`, this makes any new hook violation fail CI.
//
// Existing violations are suppressed with per-line `eslint-disable-next-line`
// directives so this file does not need to be updated as the debt is paid
// down. Keeping the overrides in a real config file (instead of passing
// `--rule` on the command line) avoids shell-quoting issues on zsh/macOS
// when args are forwarded through `npm run lint -- ...`.

const baseConfig = require('./package.json').eslintConfig;

const reactHooksRules = {
  'react-hooks/rules-of-hooks': 'warn',
  'react-hooks/exhaustive-deps': 'warn',
  'react-hooks/component-hook-factories': 'warn',
  'react-hooks/globals': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/refs': 'warn',
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/set-state-in-render': 'warn',
  'react-hooks/static-components': 'warn',
  'react-hooks/unsupported-syntax': 'warn',
  'react-hooks/use-memo': 'warn',
};

module.exports = {
  ...baseConfig,
  rules: {
    ...(baseConfig.rules || {}),
    ...reactHooksRules,
  },
};
