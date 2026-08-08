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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mcpDebugLog, redactMCPLogValue } from './debug';

let originalMcpDebugEnv: string | undefined;
let hadMcpDebugEnv = false;

afterEach(() => {
  vi.restoreAllMocks();
  if (!hadMcpDebugEnv || originalMcpDebugEnv === undefined) {
    delete process.env.HEADLAMP_MCP_DEBUG;
  } else {
    process.env.HEADLAMP_MCP_DEBUG = originalMcpDebugEnv;
  }
});

describe('redactMCPLogValue', () => {
  it('redacts both name and message for Error values', () => {
    const err = new Error('secret message');
    err.name = 'SecretError';

    expect(redactMCPLogValue(err)).toEqual({
      name: '[REDACTED]',
      message: '[REDACTED]',
    });
  });

  it('does not throw when debug redaction fails', () => {
    hadMcpDebugEnv = Object.prototype.hasOwnProperty.call(process.env, 'HEADLAMP_MCP_DEBUG');
    originalMcpDebugEnv = process.env.HEADLAMP_MCP_DEBUG;
    process.env.HEADLAMP_MCP_DEBUG = 'true';
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => mcpDebugLog('debug message', cyclic)).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalledWith('debug message', '[REDACTED]');
  });
});
