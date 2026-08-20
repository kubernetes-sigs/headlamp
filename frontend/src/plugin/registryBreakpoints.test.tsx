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

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../lib/themes';
import { useLayoutBreakpoints } from './registry';

describe('Uniform Breakpoints Theme System', () => {
  it('has standardized MUI breakpoint values without legacy workarounds', () => {
    const theme = createMuiTheme({ name: 'light', base: 'light' });
    expect(theme.breakpoints.values).toEqual({
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    });
  });

  it('exposes useLayoutBreakpoints hook to plugins with correct values and properties', () => {
    const { result } = renderHook(() => useLayoutBreakpoints());
    expect(result.current.values).toEqual({
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    });
    expect(typeof result.current.isXs).toBe('boolean');
    expect(typeof result.current.isSm).toBe('boolean');
    expect(typeof result.current.isMd).toBe('boolean');
    expect(typeof result.current.isLg).toBe('boolean');
    expect(typeof result.current.isXl).toBe('boolean');
    expect(typeof result.current.isMobile).toBe('boolean');
    expect(typeof result.current.isTablet).toBe('boolean');
  });
});
