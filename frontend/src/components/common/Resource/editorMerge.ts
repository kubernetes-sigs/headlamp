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

import * as yaml from 'js-yaml';
import _ from 'lodash';
import { isNullable } from '../../../lib/util';

export type Path = Array<string | number>;
export type PathOp =
  | { type: 'set'; path: Path; baseValue: unknown; value: unknown }
  | { type: 'delete'; path: Path; baseValue: unknown };

// Server-managed fields we generally don't want to treat as "user changes".
// Used both for external-change highlighting suppression and auto-merge diffing.
const ignoredServerManagedPathPrefixes: Path[] = [
  ['metadata', 'managedFields'],
  ['metadata', 'resourceVersion'],
  ['metadata', 'generation'],
  ['metadata', 'uid'],
  ['metadata', 'creationTimestamp'],
  ['status'],
];

function pathStartsWith(path: Path, prefix: Path): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

function shouldIgnoreMergePath(path: Path): boolean {
  return ignoredServerManagedPathPrefixes.some(prefix => pathStartsWith(path, prefix));
}

export function diffToPathOps(base: any, local: any, path: Path = []): PathOp[] {
  if (shouldIgnoreMergePath(path)) return [];
  if (_.isEqual(base, local)) return [];

  // Arrays (including when only one side is an array) are treated as atomic values.
  // This intentionally handles array/non-array type mismatches as full replacements
  // instead of attempting element-wise merges. As a consequence, if both sides modify
  // the same array, the merge logic will surface this as a single conflict that always
  // requires manual resolution rather than attempting to auto-merge individual elements.
  if (Array.isArray(base) || Array.isArray(local)) {
    return [{ type: 'set', path, baseValue: base, value: local }];
  }

  // Objects: recurse by keys.
  const baseIsObj = base !== null && typeof base === 'object';
  const localIsObj = local !== null && typeof local === 'object';
  if (baseIsObj && localIsObj) {
    const ops: PathOp[] = [];
    const keys = new Set<string>([...Object.keys(base), ...Object.keys(local)]);
    for (const key of keys) {
      const bHas = Object.prototype.hasOwnProperty.call(base, key);
      const lHas = Object.prototype.hasOwnProperty.call(local, key);
      const nextPath = [...path, key];
      if (!lHas && bHas) {
        if (!shouldIgnoreMergePath(nextPath)) {
          ops.push({ type: 'delete', path: nextPath, baseValue: base[key] });
        }
        continue;
      }
      if (lHas && !bHas) {
        if (!shouldIgnoreMergePath(nextPath)) {
          ops.push({
            type: 'set',
            path: nextPath,
            baseValue: undefined,
            value: local[key],
          });
        }
        continue;
      }
      ops.push(...diffToPathOps(base[key], local[key], nextPath));
    }
    return ops;
  }

  // Primitive or type-changed value: replace.
  return [{ type: 'set', path, baseValue: base, value: local }];
}

export function getAtPath(root: any, path: Path): any {
  let cur = root;
  for (const seg of path) {
    if (isNullable(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/**
 * In-place variants for applying many ops efficiently.
 *
 * These mutate nested containers in-place (to avoid `_.cloneDeep` per operation), but they may
 * still replace the root value (e.g. when `path` is empty, or when `root` is not an object and
 * we need to materialize a container). Always use the returned root value.
 */
export function setAtPathInPlace(root: any, path: Path, value: any): any {
  if (path.length === 0) return value;

  // Ensure root is a container we can assign into.
  if (root === null || typeof root !== 'object') {
    // We intentionally normalize the incoming root into an object/array here so that the
    // rest of this helper can perform in-place updates efficiently. Callers must always
    // use the returned root value, so this reassignment does not leak outside the function.
    // eslint-disable-next-line no-param-reassign
    root = typeof path[0] === 'number' ? [] : {};
  }

  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const nextSeg = path[i + 1];
    if (cur[seg] === null || typeof cur[seg] !== 'object') {
      cur[seg] = typeof nextSeg === 'number' ? [] : {};
    }
    cur = cur[seg];
  }
  cur[path[path.length - 1]] = value;
  return root;
}

/**
 * In-place delete variant for applying many ops efficiently.
 *
 * Note: an empty `path` is treated as a no-op (we never "delete the whole document" here).
 * Always use the returned root value.
 */
export function deleteAtPathInPlace(root: any, path: Path): any {
  if (path.length === 0) return root;
  if (root === null || typeof root !== 'object') return root;
  let cur: any = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (isNullable(cur)) return root;
    cur = cur[seg];
  }
  if (cur && typeof cur === 'object') {
    delete cur[path[path.length - 1]];
  }
  return root;
}

function looksLikeJson(code: string): boolean {
  const trimmedCode = code.trimStart();
  const firstChar = !!trimmedCode ? trimmedCode[0] : '';
  if (['{', '['].includes(firstChar)) {
    return true;
  }
  return false;
}

function parseSingleDoc(
  codeStr: string,
  formatHint: string,
  errorMessage: (key: string) => string
): { obj: any | null; format: string } {
  const format = formatHint || (looksLikeJson(codeStr) ? 'json' : 'yaml');
  let obj: any[] | null = null;
  let error: Error | null = null;

  if (format === 'json' || (!formatHint && looksLikeJson(codeStr))) {
    try {
      const parsedCode = JSON.parse(codeStr);
      obj = Array.isArray(parsedCode) ? parsedCode : [parsedCode];
      return { obj: obj[0], format: 'json' };
    } catch (e) {
      error = new Error((e as Error).message || errorMessage('Invalid JSON'));
      throw error;
    }
  }

  try {
    obj = yaml.loadAll(codeStr) as any[];
    obj = obj.filter(o => !!o);
    if (!obj || obj.length !== 1) {
      throw new Error(
        errorMessage('Automatic merge is only supported for a single YAML/JSON document.')
      );
    }
    return { obj: obj[0], format: 'yaml' };
  } catch (e) {
    if (e instanceof Error && e.message.includes('Automatic merge')) {
      throw e;
    }
    error = new Error((e as Error).message || errorMessage('Invalid YAML'));
    throw error;
  }
}

function stringifyDoc(obj: any, format: string): string {
  if (format === 'json') {
    try {
      return JSON.stringify(
        obj,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      );
    } catch (error) {
      throw new Error(
        `Failed to serialize document to JSON: ${(error as Error)?.message ?? String(error)}`
      );
    }
  }
  return yaml.dump(obj);
}

export interface MergeResult {
  mergedCode: string;
  conflicts: string[];
}

export function mergeLocalIntoServer({
  baseCode,
  localCode,
  serverCode,
  formatHint,
  errorMessage,
}: {
  baseCode: string;
  localCode: string;
  serverCode: string;
  formatHint: string;
  errorMessage: (key: string) => string;
}): MergeResult {
  const base = parseSingleDoc(baseCode, formatHint, errorMessage);
  const local = parseSingleDoc(localCode, base.format, errorMessage);
  const server = parseSingleDoc(serverCode, base.format, errorMessage);

  const ops = diffToPathOps(base.obj, local.obj);
  const conflicts: string[] = [];
  const serverObj = server.obj;
  // Clone once, then apply all ops in-place to avoid O(n * cloneDeep(server)).
  let mergedObj: any = _.cloneDeep(serverObj ?? {});

  for (const op of ops) {
    const serverAtPath = getAtPath(serverObj, op.path);
    const baseAtPath = op.baseValue;
    const localTarget = op.type === 'set' ? op.value : undefined;

    const serverChangedSinceBase = !_.isEqual(serverAtPath, baseAtPath);
    const localDiffersFromServer = !_.isEqual(localTarget, serverAtPath);
    if (serverChangedSinceBase && localDiffersFromServer) {
      conflicts.push(op.path.map(String).join('.'));
      continue;
    }

    if (op.type === 'set') {
      mergedObj = setAtPathInPlace(mergedObj, op.path, op.value);
    } else {
      mergedObj = deleteAtPathInPlace(mergedObj, op.path);
    }
  }

  return { mergedCode: stringifyDoc(mergedObj, base.format), conflicts };
}
