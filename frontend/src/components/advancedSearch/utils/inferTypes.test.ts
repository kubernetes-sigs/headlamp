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

import { generateGlobalVarDeclarations } from './inferTypes';

describe('generateGlobalVarDeclarations', () => {
  it('should return an empty string for an empty array', () => {
    expect(generateGlobalVarDeclarations([])).toBe('');
  });

  it('should handle basic types', () => {
    const objects = [
      { kind: 'Pod', apiVersion: 'v1', status: 'Running', replicas: null },
      { kind: 'Deployment', apiVersion: 'apps/v1', status: 'Available', replicas: 3 },
    ];
    const expected = `declare var apiVersion: "apps/v1" | "v1";

declare var kind: "Deployment" | "Pod";

declare var replicas: null | number;

declare var status: "Available" | "Running";`;
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should handle nested objects', () => {
    const objects = [
      {
        metadata: { name: 'pod-a', namespace: 'default', labels: { app: 'nginx' } },
      },
      {
        metadata: { name: 'pod-b', namespace: 'kube-system', labels: { app: 'kube-proxy' } },
      },
    ];
    const expected = `declare var metadata: {
  labels: {
    app: "kube-proxy" | "nginx";
  };
  name: "pod-a" | "pod-b";
  namespace: "default" | "kube-system";
};`;
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should handle optional properties', () => {
    const objects = [{ name: 'Alice', age: 30 }, { name: 'Bob' }];

    const result = generateGlobalVarDeclarations(objects);
    expect(result).toContain('declare var age: number;');
    expect(result).toContain('declare var name: "Alice" | "Bob";');
  });

  it('should handle mixed types in arrays', () => {
    const objects = [{ data: [1, 'hello', true] }];
    const expected = 'declare var data: ("hello" | boolean | number)[];';
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should handle arrays of objects', () => {
    const objects = [
      {
        containers: [
          { name: 'nginx-container', image: 'nginx:latest' },
          { name: 'sidecar-container', image: 'fluentd:latest' },
        ],
      },
      { containers: [{ name: 'app-container', image: 'my-app:1.2.3' }] },
    ];
    const expected = `declare var containers: ({
  image: "fluentd:latest" | "my-app:1.2.3" | "nginx:latest";
  name: "app-container" | "nginx-container" | "sidecar-container";
})[];`;
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should use generic string type if string literals exceed MAX_STRING_LITERALS', () => {
    const manyStrings = Array.from({ length: 201 }, (_, i) => ({ name: `User${i}` }));
    const expected = 'declare var name: string;';
    expect(generateGlobalVarDeclarations(manyStrings)).toBe(expected);
  });

  it('should use generic string type if string literal length exceeds MAX_STRING_LITERAL_LENGTH', () => {
    const objects = [{ name: 'ThisIsAVeryLongStringThatExceedsTheLimit' }];
    const expected = 'declare var name: string;';
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should handle keys that are not valid identifiers by skipping them', () => {
    const objects = [{ 'not-valid': 1, validKey: 2 }];
    const expected = 'declare var validKey: number;';
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should return Record<string, any> for objects with too many keys', () => {
    const manyKeys: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      manyKeys[`key${i}`] = i;
    }
    const objects = [manyKeys];

    const result = generateGlobalVarDeclarations(objects, 2);
    expect(result).toContain('declare var key0: number;');
    const nestedTooManyKeys = [{ parent: { child: manyKeys } }];
    const expectedNested = 'declare var parent: {\n  child: Record<string, any>;\n};';
    expect(generateGlobalVarDeclarations(nestedTooManyKeys, 2)).toBe(expectedNested);
  });

  it('should handle empty objects within an array', () => {
    const objects = [{}, { name: 'test' }];
    const expected = 'declare var name: "test";';
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should handle objects with only null values', () => {
    const objects = [{ data: null }, { data: null }];
    const expected = 'declare var data: null;';
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });

  it('should throw TypeError if input is not an array', () => {
    expect(() => generateGlobalVarDeclarations({} as any)).toThrow(TypeError);
    expect(() => generateGlobalVarDeclarations('not an array' as any)).toThrow(TypeError);
  });

  it('should correctly make nested properties optional', () => {
    const objects = [
      { metadata: { name: 'obj1', labels: { app: 'A' } } },
      { metadata: { name: 'obj2' } },
    ];
    const expected = `declare var metadata: {
  labels?: {
    app: "A";
  };
  name: "obj1" | "obj2";
};`;
    expect(generateGlobalVarDeclarations(objects)).toBe(expected);
  });
});
