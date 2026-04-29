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

import { Meta, StoryFn } from '@storybook/react';
import { AnsiText } from './AnsiText';

export default {
  title: 'common/LogsViewer/AnsiText',
  component: AnsiText,
  decorators: [
    Story => (
      <pre style={{ fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap' }}>
        <Story />
      </pre>
    ),
  ],
} as Meta<typeof AnsiText>;

const Template: StoryFn<typeof AnsiText> = args => <AnsiText {...args} />;

/** Plain text without any ANSI escape sequences renders as-is. */
export const PlainText = Template.bind({});
PlainText.args = {
  text: 'Plain log line with no ANSI escape sequences.',
};

/** Standard 8-color foreground colors. */
export const ForegroundColors = Template.bind({});
ForegroundColors.args = {
  text:
    '\u001b[30mblack\u001b[0m \u001b[31mred\u001b[0m \u001b[32mgreen\u001b[0m ' +
    '\u001b[33myellow\u001b[0m \u001b[34mblue\u001b[0m \u001b[35mmagenta\u001b[0m ' +
    '\u001b[36mcyan\u001b[0m \u001b[37mwhite\u001b[0m',
};

/** Bright foreground colors (codes 90-97). */
export const BrightForegroundColors = Template.bind({});
BrightForegroundColors.args = {
  text:
    '\u001b[90mbright black\u001b[0m \u001b[91mbright red\u001b[0m ' +
    '\u001b[92mbright green\u001b[0m \u001b[93mbright yellow\u001b[0m ' +
    '\u001b[94mbright blue\u001b[0m \u001b[95mbright magenta\u001b[0m ' +
    '\u001b[96mbright cyan\u001b[0m \u001b[97mbright white\u001b[0m',
};

/** Background colors. */
export const BackgroundColors = Template.bind({});
BackgroundColors.args = {
  text:
    '\u001b[41m red bg \u001b[0m \u001b[42m green bg \u001b[0m \u001b[44m blue bg \u001b[0m ' +
    '\u001b[103m bright yellow bg \u001b[0m',
};

/** Text attributes: bold, italic, underline. */
export const TextAttributes = Template.bind({});
TextAttributes.args = {
  text:
    '\u001b[1mbold\u001b[0m \u001b[3mitalic\u001b[0m \u001b[4munderline\u001b[0m ' +
    '\u001b[1;31mbold red\u001b[0m \u001b[4;33munderlined yellow\u001b[0m',
};

/** Combined foreground, background, and attributes within a single line. */
export const Combined = Template.bind({});
Combined.args = {
  text:
    'INFO \u001b[1;32m[OK]\u001b[0m server started ' +
    '\u001b[33mWARN\u001b[0m connection slow ' +
    '\u001b[1;37;41m FATAL \u001b[0m core dumped',
};

/** Highlight ranges wrap matching characters with a search-highlight span. */
export const WithSearchHighlights = Template.bind({});
WithSearchHighlights.args = {
  text: 'The quick brown fox jumps over the lazy dog',
  highlightRanges: [
    [4, 9],
    [16, 19],
    [35, 39],
  ],
};

/** Highlight ranges combined with ANSI colored text. */
export const HighlightsWithAnsi = Template.bind({});
HighlightsWithAnsi.args = {
  text: '\u001b[32minfo\u001b[0m: starting \u001b[31merror\u001b[0m: failed to start',
  highlightRanges: [
    [6, 14],
    [24, 30],
  ],
};

/** One of the highlight ranges is marked as the active selection. */
export const WithSelectedHighlight = Template.bind({});
WithSelectedHighlight.args = {
  text: 'match one and match two and match three',
  highlightRanges: [
    [0, 5],
    [14, 19],
    [28, 33],
  ],
  selectedHighlightRange: [14, 19],
};
