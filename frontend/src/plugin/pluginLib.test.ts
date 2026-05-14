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
import { forEach, isObject } from 'lodash';
import { describe, expect, it } from 'vitest';

/** Recursively walk all object entries and replace values */
function objectMapRecursive(collection: any, iteratee: (value: any) => any) {
  forEach(collection, (value, key) => {
    collection[key] = iteratee(value);
    if (isObject(collection[key])) {
      objectMapRecursive(collection[key], iteratee);
    }
  });
}

describe('pluginLib variable', () => {
  it('should stay the same for plugin compatibility', async () => {
    const externalLibs = [
      'Iconify',
      'Lodash',
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

    // Replace all module instances with plain object
    // so that `inspect` function can properly serialize them
    objectMapRecursive(window.pluginLib, value => {
      if (value && typeof value === 'object' && value[Symbol.toStringTag] === 'Module') {
        return { ...value };
      }
      return value;
    });

    // Excluded default Class properties
    const excludedKeys = new Set(Object.getOwnPropertyNames(class {}));

    // Add more information to the pluginLib instead of just 'Function'
    objectMapRecursive(window.pluginLib, value => {
      // Format classes by converting it to an object with all property names
      if (
        value &&
        typeof value === 'function' &&
        'toString' in value &&
        value.toString().startsWith('class')
      ) {
        const result: Record<string, any> = {};

        Object.getOwnPropertyNames(value).forEach(key => {
          if (excludedKeys.has(key)) return;

          const descriptor = Object.getOwnPropertyDescriptor(value, key);

          if (!descriptor) return;

          // To make sure we don't call getters we'll create a new function by binding it
          result[key] = descriptor.get ? descriptor.get.bind(value) : value[key];
        });

        return result;
      }

      // Format function with the amount of arguments
      if (value && typeof value === 'function') {
        return `Function with ${value.length} argument(s)`;
      }
      return value;
    });

    await expect(window.pluginLib).toMatchFileSnapshot('__snapshots__/pluginLib.snapshot');
  });
});
