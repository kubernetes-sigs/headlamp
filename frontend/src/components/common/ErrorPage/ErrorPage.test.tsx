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

import '../../../i18n/config';
import Typography from '@mui/material/Typography';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import ErrorComponent from './ErrorPage';

describe('ErrorComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders custom message content without invalid heading nesting warnings', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <TestContext>
        <ErrorComponent message={<Typography variant="h3">Not sure what to do!</Typography>} />
      </TestContext>
    );

    const customHeading = screen.getByRole('heading', { level: 3, name: 'Not sure what to do!' });

    expect(customHeading.closest('h2')).toBeNull();
    expect(
      consoleErrorSpy.mock.calls.some(call =>
        call.some(arg => String(arg).includes('validateDOMNesting'))
      )
    ).toBe(false);
  });

  it('renders numeric zero as a custom message', () => {
    render(
      <TestContext>
        <ErrorComponent message={0} />
      </TestContext>
    );

    expect(screen.getByRole('heading', { level: 2, name: '0' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'home' })).not.toBeInTheDocument();
  });

  it('keeps the default fallback message as a level-two heading', () => {
    render(
      <TestContext>
        <ErrorComponent />
      </TestContext>
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Head back\s+home\.$/);
  });
});
