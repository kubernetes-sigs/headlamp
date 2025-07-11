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

function stripTimestampPrefix(line: string): string {
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/;
  return line.replace(timestampRegex, '').trim();
}

export function colorizePrettifiedLog(logEntry: string): string {
  const cleaned = stripTimestampPrefix(logEntry);

  try {
    const parsed = JSON.parse(cleaned);
    const pretty = JSON.stringify(parsed, null, 2);

    return (
      pretty
        .replace(/"([^"]+)":/g, `${ANSI_BLUE}"$1"${ANSI_RESET}:`) // Keys
        .replace(/: "([^"]*)"/g, `: ${ANSI_GREEN}"$1"${ANSI_RESET}`) // String values
        .replace(/: (-?\d+(?:\.\d+)?)/g, `: ${ANSI_GREEN}$1${ANSI_RESET}`) // Numbers
        .replace(/: (true|false|null)/g, `: ${ANSI_GREEN}$1${ANSI_RESET}`) + '\n' // Booleans/null with newline
    );
  } catch (e) {
    return logEntry;
  }
}
