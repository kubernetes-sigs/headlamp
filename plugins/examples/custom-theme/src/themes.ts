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

// `AppTheme` lives in headlamp-plugin under lib/lib/AppTheme; the bare
// `@kinvolk/headlamp-plugin/lib` index doesn't re-export the type yet, and
// the currently published `AppTheme` doesn't yet include the optional
// `terminal` field this example demonstrates. Intersect the published type
// with a local terminal shape so this example builds against any recent
// headlamp-plugin release.
import type { AppTheme as PublishedAppTheme } from '@kinvolk/headlamp-plugin/lib/lib/AppTheme';

type TerminalTheme = {
  background?: string;
  foreground?: string;
  cursor?: string;
  ansi?: Partial<Record<string, string>>;
};

type AppTheme = PublishedAppTheme & { terminal?: TerminalTheme };

// To see this theme, go into Settings then General and select
// "my custom theme" from the dropdown.
export const customTheme: AppTheme = {
  name: 'my custom theme',
  base: 'light',
  primary: '#414141',
  secondary: '#eff2f5',
  text: {
    primary: '#44444f',
  },
  background: {
    muted: '#f5f5f5',
  },
  sidebar: {
    background: '#f0f0f0',
    color: '#605e5c',
    selectedBackground: '#f2e600',
    selectedColor: '#292827',
    actionBackground: '#414141',
  },
  navbar: {
    background: '#f0f0f0',
    color: '#292827',
  },
  buttonTextTransform: 'none',
  radius: 6,
};

// "my custom theme with terminal" demonstrates how a plugin can override the
// xterm.js colors used by the pod logs viewer, the pod exec terminal and the
// node shell. By default Headlamp derives those colors from the surrounding
// MUI palette (text on a muted surface), so most plugins don't need to set
// anything here. A plugin only needs `terminal:` when it wants the terminal
// to look different from the rest of the app — e.g. keeping a dark terminal
// inside an otherwise light theme.
//
// Tip: keep `terminal.foreground` at a 4.5:1 contrast ratio against
// `terminal.background` (WCAG 2.1 AA) so log output stays readable. See
// `themeAccessibility.test.ts` next to this file for an example assertion.
export const customThemeWithTerminal: AppTheme = {
  name: 'my custom theme with terminal',
  base: 'light',
  primary: '#414141',
  text: {
    primary: '#44444f',
  },
  background: {
    muted: '#f5f5f5',
  },
  // Inline xterm overrides — no separate function call needed.
  terminal: {
    background: '#1e1e1e',
    foreground: '#f5f5f5',
    cursor: '#ffcc00',
    ansi: {
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#8be9fd',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
    },
  },
};
