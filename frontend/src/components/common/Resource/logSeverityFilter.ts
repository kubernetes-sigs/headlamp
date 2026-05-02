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

/** Supported log severity levels. */
export type LogSeverity = 'error' | 'warn' | 'info' | 'debug';

/** All severity levels in descending order of importance. */
export const ALL_SEVERITIES: LogSeverity[] = ['error', 'warn', 'info', 'debug'];

/**
 * Detect the severity level of a single log line.
 *
 * Supports common structured and unstructured log formats:
 * - JSON fields: "level":"error", "severity":"warning"
 * - Key-value pairs: level=error, severity=ERROR
 * - Bracketed tokens: [ERROR], [WARN], [WARNING], [INFO], [DEBUG]
 * - Space-delimited tokens (Go/Python): ERROR , WARNING , INFO , DEBUG
 *
 * @returns The detected severity, or null if none is found.
 */
export function detectSeverity(line: string): LogSeverity | null {
  const lower = line.toLowerCase();

  // --- JSON fields: "level":"error", "severity":"warn" ---
  const jsonMatch = lower.match(
    /["'](?:level|severity)["']\s*[:=]\s*["']?(error|err|fatal|panic|warn|warning|info|debug|trace)["']?/
  );
  if (jsonMatch) {
    return normalizeSeverity(jsonMatch[1]);
  }

  // --- Key-value: level=error, severity=ERROR ---
  const kvMatch = lower.match(
    /(?:level|severity)\s*=\s*["']?(error|err|fatal|panic|warn|warning|info|debug|trace)["']?/
  );
  if (kvMatch) {
    return normalizeSeverity(kvMatch[1]);
  }

  // --- Bracketed: [ERROR], [WARN], [WARNING] ---
  const bracketMatch = lower.match(/\[(error|err|fatal|panic|warn|warning|info|debug|trace)\]/);
  if (bracketMatch) {
    return normalizeSeverity(bracketMatch[1]);
  }

  // --- Space-delimited tokens (common in Go/Python logs) ---
  // Match tokens like "ERROR ", "WARNING " etc. at word boundaries
  const tokenMatch = lower.match(/\b(error|err|fatal|panic|warn|warning|info|debug|trace)\b/);
  if (tokenMatch) {
    return normalizeSeverity(tokenMatch[1]);
  }

  return null;
}

/**
 * Normalize various severity tokens to the four canonical levels.
 */
function normalizeSeverity(token: string): LogSeverity {
  switch (token) {
    case 'error':
    case 'err':
    case 'fatal':
    case 'panic':
      return 'error';
    case 'warn':
    case 'warning':
      return 'warn';
    case 'info':
      return 'info';
    case 'debug':
    case 'trace':
      return 'debug';
    default:
      return 'info';
  }
}

/**
 * Filter an array of log lines by the selected severity levels.
 *
 * Lines with no detectable severity are always included to avoid
 * hiding plain-text or structureless output.
 *
 * @param logs - The full array of log lines.
 * @param selectedSeverities - The severity levels to keep.
 * @returns The filtered array of log lines.
 */
export function filterLogsBySeverity(logs: string[], selectedSeverities: LogSeverity[]): string[] {
  // If all severities are selected, skip filtering for performance
  if (selectedSeverities.length === ALL_SEVERITIES.length) {
    return logs;
  }

  const severitySet = new Set(selectedSeverities);

  return logs.filter(line => {
    const severity = detectSeverity(line);
    // Always show lines with no detectable severity
    if (severity === null) {
      return true;
    }
    return severitySet.has(severity);
  });
}
