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

type Range = [number, number];

export const AnsiText = ({
  text,
  highlightRanges,
  selectedHighlightRange,
}: {
  text: string;
  highlightRanges?: Range[];
  selectedHighlightRange?: Range;
}) => {
  /**
   * Highlight text based on character ranges.
   * @param text The text to highlight.
   * @param offset The starting offset of this text in the original string.
   * @returns An array of strings and JSX elements with ranges wrapped in appropriate tags.
   */
  const highlightByRanges = (text: string, offset: number) => {
    if (!highlightRanges || highlightRanges.length === 0) {
      return text;
    }

    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;

    const relevantRanges = highlightRanges
      .filter(range => {
        const [start, end] = range;
        return end > offset && start < offset + text.length;
      })
      .map(range => {
        const [start, end] = range;
        const adjustedStart = Math.max(0, start - offset);
        const adjustedEnd = Math.min(text.length, end - offset);
        const isSelected =
          selectedHighlightRange &&
          selectedHighlightRange[0] === range[0] &&
          selectedHighlightRange[1] === range[1];
        return { start: adjustedStart, end: adjustedEnd, isSelected };
      })
      .sort((a, b) => a.start - b.start);

    relevantRanges.forEach((range, index) => {
      if (range.start > lastIndex) {
        parts.push(text.substring(lastIndex, range.start));
      }

      const highlightedText = text.substring(range.start, range.end);
      const className = range.isSelected ? 'search-highlight-selected' : 'search-highlight';

      parts.push(
        <b key={`highlight-${offset}-${index}`} className={className}>
          {highlightedText}
        </b>
      );

      lastIndex = range.end;
    });

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const textParts = parseAnsi(text);
  let currentOffset = 0;

  return (
    <>
      {textParts.map((part, index) => {
        const content = highlightByRanges(part.text, currentOffset);
        currentOffset += part.text.length;

        return (
          <span key={index} className={part.classes.join(' ')}>
            {content}
          </span>
        );
      })}
    </>
  );
};
