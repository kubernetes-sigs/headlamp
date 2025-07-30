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

import { describe, expect, it } from '@jest/globals';
import { checkPermissionSecret, validateCommandData } from './runCmd';

describe('checkPermissionSecret', () => {
  const baseCommandData = {
    id: '1',
    command: 'minikube',
    args: [],
    options: {},
    permissionSecrets: {},
  };

  it('returns true when permission secret matches for minikube', () => {
    const permissionSecrets = { 'runCmd-minikube': 123 };
    const commandData = {
      ...baseCommandData,
      permissionSecrets: { 'runCmd-minikube': 123 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(true);
  });

  it('returns false when permission secret is missing', () => {
    const permissionSecrets = {};
    const commandData = {
      ...baseCommandData,
      permissionSecrets: {},
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns false when permission secret does not match', () => {
    const permissionSecrets = { 'runCmd-minikube': 123 };
    const commandData = {
      ...baseCommandData,
      permissionSecrets: { 'runCmd-minikube': 456 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns true for scriptjs with correct permission secret', () => {
    const permissionSecrets = { 'runCmd-scriptjs-myscript.js': 42 };
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: { 'runCmd-scriptjs-myscript.js': 42 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(true);
  });

  it('returns false for scriptjs with missing permission secret', () => {
    const permissionSecrets = {};
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: {},
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns false for scriptjs with mismatched permission secret', () => {
    const permissionSecrets = { 'runCmd-scriptjs-myscript.js': 42 };
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: { 'runCmd-scriptjs-myscript.js': 99 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });
});

describe('validateCommandData', () => {
  it('returns false if eventData is not an object', () => {
    expect(validateCommandData(null as any)[0]).toBe(false);
    expect(validateCommandData(undefined as any)[0]).toBe(false);
    expect(validateCommandData('string' as any)[0]).toBe(false);
  });

  it('returns false if command is missing or not a string', () => {
    expect(validateCommandData({ args: [], options: {}, permissionSecrets: {} })[0]).toBe(false);
    expect(
      validateCommandData({ command: 123 as any, args: [], options: {}, permissionSecrets: {} })[0]
    ).toBe(false);
    expect(
      validateCommandData({ command: '', args: [], options: {}, permissionSecrets: {} })[0]
    ).toBe(false);
  });

  it('returns false if args is not an array', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: 'not-array' as any,
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns false if options is not an object', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: null as any,
        permissionSecrets: {},
      })[0]
    ).toBe(false);
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: 123 as any,
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns false if permissionSecrets is not an object', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: null as any,
      })[0]
    ).toBe(false);
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: 123 as any,
      })[0]
    ).toBe(false);
  });

  it('returns false if any permissionSecret value is not a number', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: { foo: undefined as any },
      })[0]
    ).toBe(false);
  });

  it('returns false if command is not in validCommands', () => {
    expect(
      validateCommandData({
        command: 'invalidcmd',
        args: [],
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns true for valid minikube command', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: { 'runCmd-minikube': 123 },
      })[0]
    ).toBe(true);
  });

  it('returns true for valid az command', () => {
    expect(
      validateCommandData({
        command: 'az',
        args: ['arg1'],
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(true);
  });

  it('returns true for valid scriptjs command', () => {
    expect(
      validateCommandData({
        command: 'scriptjs',
        args: ['myscript.js'],
        options: {},
        permissionSecrets: { 'runCmd-scriptjs-myscript.js': 42 },
      })[0]
    ).toBe(true);
  });
});
