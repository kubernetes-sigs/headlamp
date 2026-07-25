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

/**
 * Headlamp App Theme definition
 */
export interface AppTheme {
  name: string;
  /** Base theme to extend */
  base?: 'light' | 'dark';
  /** Primary theme color */
  primary?: string;
  /** Secondary theme color */
  secondary?: string;
  text?: {
    /** Primary text color */
    primary?: string;
  };
  link?: {
    /** Link text color */
    color?: string;
  };
  background?: {
    /** Background color of the page */
    default?: string;
    /** Background color of popups and menus */
    surface?: string;
    /** Shaded background color */
    muted?: string;
  };
  sidebar?: {
    /** Background color of the sidebar */
    background?: string;
    /** Text and icon color of the sidebar */
    color?: string;
    /** Background color for the selected item */
    selectedBackground?: string;
    /** Text color for the selected item */
    selectedColor?: string;
    /** Background color of sidebar action button */
    actionBackground?: string;
  };
  navbar?: {
    /** Background color of the navbar */
    background?: string;
    /** Text and icon color of the navbar */
    color?: string;
    /** Global search shortcut hint (falls back in createMuiTheme if omitted) */
    searchHint?: string;
  };
  /**
   * Optional terminal (xterm.js) color overrides.
   *
   * The pod log viewer, pod exec terminal and node shell all render with
   * xterm.js. By default Headlamp picks readable colors out of the surrounding
   * MUI palette and an auto-selected ANSI palette. Plugins that swap the rest
   * of the palette can also set specific terminal colors here without having
   * to call any extra function.
   *
   * Anything left undefined is filled in by Headlamp:
   *   - `background` falls back to the MUI muted/default surface,
   *   - `foreground` and `cursor` fall back to the MUI primary text color,
   *   - each missing `ansi.*` entry is taken from a built-in 16-color palette
   *     auto-selected (and contrast-clamped) for the actual terminal
   *     background luminance, so light-on-light or dark-on-dark output is
   *     never invisible.
   *
   * Tip: plugin authors should make sure `foreground` keeps a 4.5:1 contrast
   * ratio against `background` (WCAG 2.1 AA), so that the terminal stays
   * readable.
   */
  terminal?: {
    /** Background color of the terminal/log viewer area. */
    background?: string;
    /** Default foreground (text) color of the terminal. */
    foreground?: string;
    /** Cursor color. */
    cursor?: string;
    /**
     * 16-color ANSI palette used by program output. Each entry is optional;
     * any color that's left out is filled from a built-in palette
     * auto-selected for the terminal background's luminance, then nudged
     * darker/lighter as needed so it stays visible against that background.
     */
    ansi?: {
      black?: string;
      red?: string;
      green?: string;
      yellow?: string;
      blue?: string;
      magenta?: string;
      cyan?: string;
      white?: string;
      brightBlack?: string;
      brightRed?: string;
      brightGreen?: string;
      brightYellow?: string;
      brightBlue?: string;
      brightMagenta?: string;
      brightCyan?: string;
      brightWhite?: string;
    };
  };
  /** General shape radius (things like buttons, popups, etc) */
  radius?: number;
  /** Text style in buttons */
  buttonTextTransform?: 'uppercase' | 'none';
  /** Font family of the app */
  fontFamily?: string[];
}
