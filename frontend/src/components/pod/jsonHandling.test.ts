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

import { ANSI_BLUE, ANSI_GREEN, ANSI_RESET, colorizePrettifiedLog } from './jsonHandling';

describe('colorizePrettifiedLog', () => {
  it('colors JSON keys and string values', () => {
    const input = `{\n  "username": "Bob"\n}`;
    const expected = `{\n  ${ANSI_BLUE}"username"${ANSI_RESET}: ${ANSI_GREEN}"Bob"${ANSI_RESET}\n}`;
    expect(colorizePrettifiedLog(input)).toBe(expected);
  });

  it('colors numeric values', () => {
    const input = `{\n  "count": 42\n}`;
    const expected = `{\n  ${ANSI_BLUE}"count"${ANSI_RESET}: ${ANSI_GREEN}42${ANSI_RESET}\n}`;
    expect(colorizePrettifiedLog(input)).toBe(expected);
  });

  it('colors boolean and null values', () => {
    const input = `{\n  "enabled": false,\n  "config": null\n}`;
    const expected = `{\n  ${ANSI_BLUE}"enabled"${ANSI_RESET}: ${ANSI_GREEN}false${ANSI_RESET},\n  ${ANSI_BLUE}"config"${ANSI_RESET}: ${ANSI_GREEN}null${ANSI_RESET}\n}`;
    expect(colorizePrettifiedLog(input)).toBe(expected);
  });

  it('handles floats correctly', () => {
    const input = `{\n  "temperature": 72.5\n}`;
    const expected = `{\n  ${ANSI_BLUE}"temperature"${ANSI_RESET}: ${ANSI_GREEN}72.5${ANSI_RESET}\n}`;
    expect(colorizePrettifiedLog(input)).toBe(expected);
  });

  it('returns original string on error', () => {
    const input = `invalid log entry`;
    expect(colorizePrettifiedLog(input)).toBe(input);
  });
});
