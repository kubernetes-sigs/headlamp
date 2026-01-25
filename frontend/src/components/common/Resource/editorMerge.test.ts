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
import {
  deleteAtPathInPlace,
  diffToPathOps,
  getAtPath,
  mergeLocalIntoServer,
  setAtPathInPlace,
} from './editorMerge';

const errorMessage = (key: string) => key;

describe('editorMerge', () => {
  describe('getAtPath', () => {
    it('should get value at path', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(getAtPath(obj, ['a', 'b', 'c'])).toBe(42);
    });

    it('should return undefined for non-existent path', () => {
      const obj = { a: { b: { c: 42 } } };
      expect(getAtPath(obj, ['a', 'b', 'd'])).toBeUndefined();
    });

    it('should return undefined for null/undefined intermediate values', () => {
      const obj = { a: null };
      expect(getAtPath(obj, ['a', 'b'])).toBeUndefined();
    });
  });

  describe('setAtPathInPlace', () => {
    it('should set value at path', () => {
      const obj = { a: { b: { c: 42 } } };
      const result = setAtPathInPlace(obj, ['a', 'b', 'c'], 100);
      expect(result.a.b.c).toBe(100);
    });

    it('should create intermediate objects', () => {
      const obj = {};
      const result = setAtPathInPlace(obj, ['a', 'b', 'c'], 42);
      expect(result.a.b.c).toBe(42);
    });

    it('should handle empty path', () => {
      const obj = { a: 1 };
      const result = setAtPathInPlace(obj, [], 42);
      expect(result).toBe(42);
    });
  });

  describe('deleteAtPathInPlace', () => {
    it('should delete value at path', () => {
      const obj = { a: { b: { c: 42, d: 100 } } };
      const result = deleteAtPathInPlace(obj, ['a', 'b', 'c']);
      expect(result.a.b.c).toBeUndefined();
      expect(result.a.b.d).toBe(100);
    });

    it('should handle empty path', () => {
      const obj = { a: 1 };
      const result = deleteAtPathInPlace(obj, []);
      expect(result).toBe(obj);
    });
  });

  describe('diffToPathOps', () => {
    it('should detect added fields', () => {
      const base = { a: 1 };
      const local = { a: 1, b: 2 };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({ type: 'set', path: ['b'], baseValue: undefined, value: 2 });
    });

    it('should detect deleted fields', () => {
      const base = { a: 1, b: 2 };
      const local = { a: 1 };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({ type: 'delete', path: ['b'], baseValue: 2 });
    });

    it('should detect modified fields', () => {
      const base = { a: 1 };
      const local = { a: 2 };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({ type: 'set', path: ['a'], baseValue: 1, value: 2 });
    });

    it('should ignore server-managed fields', () => {
      const base = { metadata: { resourceVersion: '1' } };
      const local = { metadata: { resourceVersion: '2' } };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(0);
    });

    it('should ignore status field', () => {
      const base = { status: { phase: 'Pending' } };
      const local = { status: { phase: 'Running' } };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(0);
    });

    it('should handle arrays as atomic values', () => {
      const base = { items: [1, 2, 3] };
      const local = { items: [1, 2, 4] };
      const ops = diffToPathOps(base, local);
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('set');
      expect(ops[0].path).toEqual(['items']);
    });
  });

  describe('mergeLocalIntoServer', () => {
    it('should merge local changes into server when no conflicts', () => {
      const baseCode = JSON.stringify({ a: 1, b: 2 });
      const localCode = JSON.stringify({ a: 1, b: 3, c: 4 });
      const serverCode = JSON.stringify({ a: 1, b: 2, d: 5 });

      const result = mergeLocalIntoServer({
        baseCode,
        localCode,
        serverCode,
        formatHint: 'json',
        errorMessage,
      });

      expect(result.conflicts).toHaveLength(0);
      const merged = JSON.parse(result.mergedCode);
      expect(merged.b).toBe(3); // local change
      expect(merged.c).toBe(4); // local addition
      expect(merged.d).toBe(5); // server addition
    });

    it('should detect conflicts when both sides modify same field', () => {
      const baseCode = JSON.stringify({ a: 1 });
      const localCode = JSON.stringify({ a: 2 });
      const serverCode = JSON.stringify({ a: 3 });

      const result = mergeLocalIntoServer({
        baseCode,
        localCode,
        serverCode,
        formatHint: 'json',
        errorMessage,
      });

      expect(result.conflicts).toContain('a');
    });

    it('should work with YAML format', () => {
      const baseCode = 'a: 1\nb: 2';
      const localCode = 'a: 1\nb: 3\nc: 4';
      const serverCode = 'a: 1\nb: 2\nd: 5';

      const result = mergeLocalIntoServer({
        baseCode,
        localCode,
        serverCode,
        formatHint: 'yaml',
        errorMessage,
      });

      expect(result.conflicts).toHaveLength(0);
      expect(result.mergedCode).toContain('b: 3');
      expect(result.mergedCode).toContain('c: 4');
      expect(result.mergedCode).toContain('d: 5');
    });

    it('should throw error for multiple documents', () => {
      const baseCode = '---\na: 1\n---\nb: 2';
      const localCode = '---\na: 1\n---\nb: 2';
      const serverCode = '---\na: 1\n---\nb: 2';

      expect(() =>
        mergeLocalIntoServer({
          baseCode,
          localCode,
          serverCode,
          formatHint: 'yaml',
          errorMessage,
        })
      ).toThrow('Automatic merge is only supported for a single YAML/JSON document.');
    });
  });
});
