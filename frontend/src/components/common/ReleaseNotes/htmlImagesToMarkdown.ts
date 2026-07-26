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

/**
 * GitHub release notes often embed screenshots as raw HTML <img> tags.
 * react-markdown does not render raw HTML by default, so convert those
 * tags into markdown image syntax before rendering.
 */
export function htmlImagesToMarkdown(markdown: string): string {
  if (!markdown || !markdown.includes('<img')) {
    return markdown;
  }

  return markdown.replace(/<img\b[^>]*>/gi, tag => {
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch) {
      return '';
    }

    const src = srcMatch[2].trim();
    // Only allow http(s) image URLs from release notes.
    if (!/^https?:\/\//i.test(src)) {
      return '';
    }

    const altMatch = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i);
    const alt = (altMatch ? altMatch[2] : '').replace(/[[\]]/g, '');

    return `\n\n![${alt}](${src})\n\n`;
  });
}
