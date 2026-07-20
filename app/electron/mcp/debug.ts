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

const REDACTED = '[REDACTED]';

export function isMCPDebugLoggingEnabled(): boolean {
  return process.env.HEADLAMP_MCP_DEBUG === 'true';
}

export function redactMCPLogValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return REDACTED;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(entry => redactMCPLogValue(entry));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: REDACTED,
    };
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactMCPLogValue(entry)])
    );
  }

  return REDACTED;
}

function writeMCPDebugLog(method: 'info' | 'log', message: string, ...details: unknown[]): void {
  if (!isMCPDebugLoggingEnabled()) {
    return;
  }

  console[method](message, ...details.map(detail => redactMCPLogValue(detail)));
}

export function mcpDebugInfo(message: string, ...details: unknown[]): void {
  writeMCPDebugLog('info', message, ...details);
}

export function mcpDebugLog(message: string, ...details: unknown[]): void {
  writeMCPDebugLog('log', message, ...details);
}
