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

import { findLongestLine } from './LogViewer'; // adjust path as needed

describe('findLongestLine', () => {
  it('handles simple lines', () => {
    expect(findLongestLine(['one line\n', 'other line\n'])).toBe(10);
  });

  it('splits on real LF (\\n) for a line', () => {
    expect(findLongestLine(['a\nbbb\nc'])).toBe(3);
  });

  it('splits on real LF (\\n) for a line - longer', () => {
    const logs = ['this is a long line that for', 'some reason\nwe split'];
    expect(findLongestLine(logs)).toBe(39);
  });

  it('splits on CRLF (\\r\\n) for a line', () => {
    expect(findLongestLine(['aa\r\nbbbb'])).toBe(4);
  });

  it('ignores literal "\\n" inside a line', () => {
    const logLines = ['foo\\nbar', 'mynewlongerstring\n'];
    expect(findLongestLine(logLines)).toBe(20);
  });

  it('returns 0 for empty input', () => {
    expect(findLongestLine([])).toBe(0);
  });
});
