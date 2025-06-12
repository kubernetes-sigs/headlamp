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

export const ANSI_BLUE = '\x1b[34m';
export const ANSI_GREEN = '\x1b[32m';
export const ANSI_RESET = '\x1b[0m';

/**
 * Colorizes a JSON log entry with ANSI color codes for better readability.
 * @param logEntry - The log entry to colorize
 * @returns The colorized log entry string
 */
export function colorizePrettifiedLog(logEntry: string): string {
  try {
    return logEntry
      .replace(/"([^"]+)":/g, `${ANSI_BLUE}"$1"${ANSI_RESET}:`) // Color JSON keys
      .replace(/: "([^"]+)"/g, `: ${ANSI_GREEN}"$1"${ANSI_RESET}`) // Color string values
      .replace(/: (-?\d*\.?\d+)/g, `: ${ANSI_GREEN}$1${ANSI_RESET}`) // Color numeric values (integers and floats)
      .replace(/: (true|false|null)/g, `: ${ANSI_GREEN}$1${ANSI_RESET}`); // Color boolean/null
  } catch {
    return logEntry;
  }
}
