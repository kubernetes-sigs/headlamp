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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { theme } from '../../TestHelpers/theme';
import ActionButton from './ActionButton';

function renderActionButton(props: Partial<ComponentProps<typeof ActionButton>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ActionButton description="Delete" icon="mdi:delete" onClick={() => {}} {...props} />
    </ThemeProvider>
  );
}

describe('ActionButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps enabled icon buttons directly interactive', () => {
    renderActionButton();

    expect(screen.getByRole('button', { name: 'Delete' }).tagName).toBe('BUTTON');
  });

  it('wraps disabled icon buttons so the tooltip can still open', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClick = vi.fn();
    const parentClick = vi.fn();
    const parentKeyDown = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div onClick={parentClick} onKeyDown={parentKeyDown}>
          <ActionButton
            description="Delete"
            icon="mdi:delete"
            onClick={onClick}
            iconButtonProps={{ disabled: true, 'aria-label': 'Delete action' }}
          />
        </div>
      </ThemeProvider>
    );

    const wrapper = screen.getByRole('button', { name: 'Delete action' });

    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');

    await user.hover(wrapper);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete');

    await user.unhover(wrapper);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());

    await user.tab();

    expect(wrapper).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete');

    await user.click(wrapper);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();

    const tooltipWarnings = consoleErrorSpy.mock.calls.filter(call =>
      call.some(arg => /disabled/i.test(String(arg)) && /tooltip/i.test(String(arg)))
    );

    expect(tooltipWarnings).toHaveLength(0);
  });
});
