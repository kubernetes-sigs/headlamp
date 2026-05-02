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

// CI-only ESLint config.
//
// This re-enables the slow React-Compiler family of rules from
// eslint-plugin-react-hooks v7+ on top of the defaults declared in
// `package.json#eslintConfig`.
//
// All 10 of these rules share a single React-Compiler analysis pass:
// enabling any one of them costs the full ~13 s and ~85 MB peak-RSS,
// and adding the other 9 on top is essentially free. The default config
// already enables the cheap legacy rules (`rules-of-hooks` and
// `exhaustive-deps`, which together cost ~0.5 s on this tree).
//
// Used by:
//   - `npm run lint:slow` in `frontend/`
//   - `lint-staged` (husky pre-commit) in `frontend/package.json`
//   - the root `frontend:lint` script (CI)
module.exports = {
  extends: ['./package.json'],
  rules: {
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
  },
};
