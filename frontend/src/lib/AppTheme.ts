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
  };
  /** General shape radius (things like buttons, popups, etc) */
  radius?: number;
  /** Text style in buttons */
  buttonTextTransform?: 'uppercase' | 'none';
}
