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

import { formatShortcutKey } from './useShortcut';

describe('formatShortcutKey', () => {
  describe('single keys', () => {
    it('should format single character key to uppercase', () => {
      expect(formatShortcutKey('a')).toBe('A');
      expect(formatShortcutKey('k')).toBe('K');
    });

    it('should preserve special characters', () => {
      expect(formatShortcutKey('/')).toBe('/');
    });

    it('should capitalize special keys', () => {
      expect(formatShortcutKey('space')).toBe('Space');
      expect(formatShortcutKey('enter')).toBe('Enter');
      expect(formatShortcutKey('escape')).toBe('Esc');
    });

    it('should handle arrow keys', () => {
      expect(formatShortcutKey('ArrowDown')).toBe('↓');
      expect(formatShortcutKey('ArrowUp')).toBe('↑');
      expect(formatShortcutKey('ArrowLeft')).toBe('←');
      expect(formatShortcutKey('ArrowRight')).toBe('→');
    });
  });

  describe('modifier combinations', () => {
    it('should format ctrl combinations', () => {
      expect(formatShortcutKey('ctrl+k')).toBe('Ctrl + K');
      expect(formatShortcutKey('ctrl+a')).toBe('Ctrl + A');
    });

    it('should format shift combinations', () => {
      expect(formatShortcutKey('shift+k')).toBe('Shift + K');
    });

    it('should format alt combinations', () => {
      expect(formatShortcutKey('alt+a')).toBe('Alt + A');
    });

    it('should format meta key', () => {
      expect(formatShortcutKey('meta+k')).toBe('⌘ + K');
    });

    it('should format ctrl+shift combinations', () => {
      expect(formatShortcutKey('ctrl+shift+l')).toBe('Ctrl + Shift + L');
      expect(formatShortcutKey('ctrl+shift+t')).toBe('Ctrl + Shift + T');
      expect(formatShortcutKey('ctrl+shift+f')).toBe('Ctrl + Shift + F');
    });

    it('should format multiple modifiers', () => {
      expect(formatShortcutKey('ctrl+shift+alt+k')).toBe('Ctrl + Shift + Alt + K');
    });

    it('should format ctrl combinations with special keys', () => {
      expect(formatShortcutKey('ctrl+space')).toBe('Ctrl + Space');
      expect(formatShortcutKey('ctrl+enter')).toBe('Ctrl + Enter');
    });

    it('should format ctrl combinations with arrows', () => {
      expect(formatShortcutKey('ctrl+ArrowUp')).toBe('Ctrl + ↑');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(formatShortcutKey('')).toBe('');
    });

    it('should handle lowercase modifiers', () => {
      expect(formatShortcutKey('ctrl+k')).toBe('Ctrl + K');
    });
  });
});
