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

import './index'; // this import will init window.pluginLib
import { describe, expect, it } from 'vitest';

describe('pluginLib variable', () => {
  it('should stay the same for plugin compatibility', async () => {
    const externalLibs = [
      'Iconify',
      'MonacoEditor',
      'MuiCore',
      'MuiLab',
      'MuiMaterial',
      'MuiStyles',
      'Notistack',
      'React',
      'ReactDOM',
      'ReactJSX',
      'ReactMonacoEditor',
      'ReactRedux',
      'ReactRouter',
      'Recharts',
    ];
    // External libraries that we bundle can have different values per OS
    // So we're just going to check if they're present or not
    externalLibs.forEach(lib => {
      window.pluginLib[lib] = window.pluginLib[lib] ? 'Present' : 'Missing';
    });

    await expect(window.pluginLib).toMatchFileSnapshot('__snapshots__/pluginLib.snapshot');
  });
});
