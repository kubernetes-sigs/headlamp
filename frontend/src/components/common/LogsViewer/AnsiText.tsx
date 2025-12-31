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

import './AnsiText.css';

export const AnsiText = ({ text, searchQuery }: { text: string; searchQuery?: string }) => {
  const ansiCodes: Record<string, string> = {
    '1': 'ansi-bold',
    '3': 'ansi-italic',
    '4': 'ansi-underline',
    '30': 'ansi-black-fg',
    '31': 'ansi-red-fg',
    '32': 'ansi-green-fg',
    '33': 'ansi-yellow-fg',
    '34': 'ansi-blue-fg',
    '35': 'ansi-magenta-fg',
    '36': 'ansi-cyan-fg',
    '37': 'ansi-white-fg',
    '90': 'ansi-bright-black-fg',
    '91': 'ansi-bright-red-fg',
    '92': 'ansi-bright-green-fg',
    '93': 'ansi-bright-yellow-fg',
    '94': 'ansi-bright-blue-fg',
    '95': 'ansi-bright-magenta-fg',
    '96': 'ansi-bright-cyan-fg',
    '97': 'ansi-bright-white-fg',
    '40': 'ansi-black-bg',
    '41': 'ansi-red-bg',
    '42': 'ansi-green-bg',
    '43': 'ansi-yellow-bg',
    '44': 'ansi-blue-bg',
    '45': 'ansi-magenta-bg',
    '46': 'ansi-cyan-bg',
    '47': 'ansi-white-bg',
    '100': 'ansi-bright-black-bg',
    '101': 'ansi-bright-red-bg',
    '102': 'ansi-bright-green-bg',
    '103': 'ansi-bright-yellow-bg',
    '104': 'ansi-bright-blue-bg',
    '105': 'ansi-bright-magenta-bg',
    '106': 'ansi-bright-cyan-bg',
    '107': 'ansi-bright-white-bg',
  };

  const parseAnsi = (inputText: string) => {
    const ansiRegex = /\u001b\[([0-9;]*)m/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    const currentClasses = new Set<string>();

    while ((match = ansiRegex.exec(inputText)) !== null) {
      const textBefore = inputText.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push({ text: textBefore, classes: Array.from(currentClasses) });
      }

      lastIndex = ansiRegex.lastIndex;

      const codes = match[1].split(';').filter(Boolean);

      // An empty code sequence is a reset.
      if (codes.length === 0) {
        currentClasses.clear();
        continue;
      }

      codes.forEach(code => {
        if (code === '0') {
          // Full reset.
          currentClasses.clear();
        } else if (code === '39') {
          // Reset foreground color.
          currentClasses.forEach(cls => {
            if (cls.endsWith('-fg')) {
              currentClasses.delete(cls);
            }
          });
        } else if (code === '49') {
          // Reset background color.
          currentClasses.forEach(cls => {
            if (cls.endsWith('-bg')) {
              currentClasses.delete(cls);
            }
          });
        } else {
          const newClass = ansiCodes[code];
          if (newClass) {
            // If setting a new color, remove any existing color of the same type.
            const isFg = newClass.endsWith('-fg');
            const isBg = newClass.endsWith('-bg');

            if (isFg || isBg) {
              const typeSuffix = isFg ? '-fg' : '-bg';
              currentClasses.forEach(cls => {
                if (cls.endsWith(typeSuffix)) {
                  currentClasses.delete(cls);
                }
              });
            }
            currentClasses.add(newClass);
          }
        }
      });
    }

    // Add any remaining text after the last ANSI code.
    const remainingText = inputText.substring(lastIndex);
    if (remainingText) {
      parts.push({ text: remainingText, classes: Array.from(currentClasses) });
    }

    return parts;
  };

  /**
   * Highlight matches of a search query in a text.
   * @param text The text to search within.
   * @param query The search query.
   * @returns An array of strings and JSX elements with matches wrapped in <b> tags.
   */
  const highlightMatches = (text: string, query?: string) => {
    if (!query) {
      return text;
    }

    // Escape special characters for regex
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <b key={index} className="search-highlight">
          {part}
        </b>
      ) : (
        part
      )
    );
  };

  const textParts = parseAnsi(text);

  return (
    <>
      {textParts.map((part, index) => (
        <span key={index} className={part.classes.join(' ')}>
          {highlightMatches(part.text, searchQuery)}
        </span>
      ))}
    </>
  );
};
