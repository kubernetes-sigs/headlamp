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
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../TestHelpers/theme';
import BackLink, { BackLinkProps } from './BackLink';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

function renderBackLink(props: BackLinkProps = {}, history: History = createMemoryHistory()) {
  const renderResult = render(
    <Router history={history}>
      <ThemeProvider theme={theme}>
        <BackLink {...props} />
      </ThemeProvider>
    </Router>
  );
  return { ...renderResult, history };
}

describe('BackLink', () => {
  it('renders the button with localized "Back" label', () => {
    renderBackLink();

    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('MuiButton-sizeSmall');
  });

  it('applies the theme primaryColor to the button', () => {
    renderBackLink();

    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveStyle({ color: theme.palette.primaryColor });
  });

  it('navigates back in history when clicked and no "to" prop is passed', () => {
    const history = createMemoryHistory({
      initialEntries: ['/home', '/details'],
      initialIndex: 1,
    });
    expect(history.location.pathname).toBe('/details');

    renderBackLink({}, history);

    const button = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(button);

    expect(history.location.pathname).toBe('/home');
  });

  it('navigates back in history when "to" is an empty string', () => {
    const history = createMemoryHistory({
      initialEntries: ['/home', '/details'],
      initialIndex: 1,
    });
    expect(history.location.pathname).toBe('/details');

    renderBackLink({ to: '' }, history);

    const button = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(button);

    expect(history.location.pathname).toBe('/home');
  });

  it('navigates to the specified target path when "to" is a string path', () => {
    const history = createMemoryHistory({ initialEntries: ['/current-page'] });

    renderBackLink({ to: '/c/my-cluster/pods' }, history);

    const button = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(button);

    expect(history.location.pathname).toBe('/c/my-cluster/pods');
  });

  it('navigates to the location object when "to" is a Location object', () => {
    const history = createMemoryHistory({ initialEntries: ['/current-page'] });
    const targetLocation = {
      pathname: '/c/my-cluster/overview',
      search: '?filter=test',
      state: null,
      hash: '',
    };

    renderBackLink({ to: targetLocation }, history);

    const button = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(button);

    expect(history.location.pathname).toBe('/c/my-cluster/overview');
    expect(history.location.search).toBe('?filter=test');
  });
});
