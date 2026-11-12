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

import { describe, expect, it } from 'vitest';
import { parseEditorObject } from './parseEditorObject';

describe('parseEditorObject', () => {
  it('returns empty object for blank or whitespace-only inputs', () => {
    expect(parseEditorObject('')).toEqual({});
    expect(parseEditorObject('   ')).toEqual({});
    expect(parseEditorObject('\n\t\n')).toEqual({});
  });

  it('parses valid YAML string into plain object', () => {
    const yamlInput = `
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: default
spec:
  containers:
    - name: nginx
      image: nginx:latest
`;
    expect(parseEditorObject(yamlInput)).toEqual({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'my-pod',
        namespace: 'default',
      },
      spec: {
        containers: [
          {
            name: 'nginx',
            image: 'nginx:latest',
          },
        ],
      },
    });
  });

  it('returns null for syntax-invalid YAML without throwing', () => {
    expect(parseEditorObject('invalid: [unclosed')).toBeNull();
    expect(parseEditorObject('foo: : bar')).toBeNull();
  });

  it('returns null for YAML arrays', () => {
    const arrayInput = `
- item1
- item2
`;
    expect(parseEditorObject(arrayInput)).toBeNull();
  });

  it('returns null for primitive scalar values', () => {
    expect(parseEditorObject('"just a string"')).toBeNull();
    expect(parseEditorObject('12345')).toBeNull();
    expect(parseEditorObject('true')).toBeNull();
  });

  it('returns null for YAML comments only or null documents', () => {
    expect(parseEditorObject('# only a comment')).toBeNull();
    expect(parseEditorObject('---')).toBeNull();
    expect(parseEditorObject('null')).toBeNull();
  });
});
