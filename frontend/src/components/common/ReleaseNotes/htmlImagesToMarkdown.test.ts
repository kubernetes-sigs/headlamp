/*
 * Copyright 2026 The Kubernetes Authors
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

import { htmlImagesToMarkdown } from './htmlImagesToMarkdown';

describe('htmlImagesToMarkdown', () => {
  it('returns markdown unchanged when there are no img tags', () => {
    const input = '## Hello\n\nNo images here.';
    expect(htmlImagesToMarkdown(input)).toBe(input);
  });

  it('converts GitHub-style HTML img tags to markdown images', () => {
    const input =
      '## Feature\n\n<img width="800" height="352" alt="Cluster inventory" src="https://github.com/user-attachments/assets/abc123" />\n\nMore text';
    const result = htmlImagesToMarkdown(input);

    expect(result).toContain('![Cluster inventory](https://github.com/user-attachments/assets/abc123)');
    expect(result).not.toContain('<img');
  });

  it('handles src before alt and single quotes', () => {
    const input = `<img src='https://example.com/a.png' alt='Demo' />`;
    expect(htmlImagesToMarkdown(input)).toContain('![Demo](https://example.com/a.png)');
  });

  it('drops non-http(s) image sources', () => {
    const input = `<img src="javascript:alert(1)" alt="x" /><img src="https://example.com/ok.png" alt="ok" />`;
    const result = htmlImagesToMarkdown(input);

    expect(result).not.toContain('javascript:');
    expect(result).toContain('![ok](https://example.com/ok.png)');
  });
});
