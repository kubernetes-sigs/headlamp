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
import { SnackbarProvider } from 'notistack';
import React from 'react';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import defaultStore from '../../redux/stores/store';
import { TestContext } from '../../test';
import { theme } from '../TestHelpers/theme';
import SectionBox, { SectionBoxProps } from './SectionBox';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

function renderSectionBox(props: SectionBoxProps = {}) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <SectionBox {...props} />
      </ThemeProvider>
    </TestContext>
  );
}

function renderSectionBoxWithHistory(
  props: SectionBoxProps = {},
  history: History = createMemoryHistory()
) {
  const renderResult = render(
    <Provider store={defaultStore}>
      <SnackbarProvider>
        <Router history={history}>
          <ThemeProvider theme={theme}>
            <SectionBox {...props} />
          </ThemeProvider>
        </Router>
      </SnackbarProvider>
    </Provider>
  );
  return { ...renderResult, history };
}

describe('SectionBox', () => {
  it('renders children properly within the inner container', () => {
    renderSectionBox({
      id: 'inner-box',
      children: (
        <>
          <div data-testid="child-1">First Child</div>
          <div data-testid="child-2">Second Child</div>
        </>
      ),
    });

    const innerBox = document.getElementById('inner-box');
    expect(innerBox).toBeInTheDocument();
    expect(innerBox).toContainElement(screen.getByTestId('child-1'));
    expect(innerBox).toContainElement(screen.getByTestId('child-2'));
  });

  it('renders SectionHeader with title and subtitle when title is a string', () => {
    renderSectionBox({
      title: 'My Section Title',
      subtitle: 'Helpful subtitle description',
      children: <div>Content</div>,
    });

    // Default headerProps is subsection which maps to h2, and default non-zero padding (noPadding: false)
    const heading = screen.getByRole('heading', { level: 2, name: 'My Section Title' });
    expect(heading).toBeInTheDocument();
    expect(heading.closest('.MuiGrid-container')).toHaveStyle({
      paddingLeft: '16px',
      paddingTop: '24px',
    });
    expect(screen.getByText('Helpful subtitle description')).toBeInTheDocument();
  });

  it('renders custom ReactNode title directly without SectionHeader wrapper', () => {
    renderSectionBox({
      title: <h1 data-testid="custom-title-node">Custom Element Title</h1>,
      children: <div>Content</div>,
    });

    expect(screen.getByTestId('custom-title-node')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Custom Element Title' })
    ).toBeInTheDocument();
    // Verify no default subsection h2 was rendered
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('does not render any title when title is omitted or undefined', () => {
    renderSectionBox({
      children: <div data-testid="content-only">No Title Content</div>,
    });

    expect(screen.getByTestId('content-only')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('forwards custom headerProps to SectionHeader', () => {
    renderSectionBox({
      title: 'Main Header Title',
      headerProps: { headerStyle: 'main', noPadding: true },
      children: <div>Content</div>,
    });

    // When headerStyle is 'main', SectionHeader renders an h1 variant
    const heading = screen.getByRole('heading', { level: 1, name: 'Main Header Title' });
    expect(heading).toBeInTheDocument();

    // Verify noPadding: true removes padding on SectionHeader container
    const headerContainer = heading.closest('.MuiGrid-container');
    expect(headerContainer).toHaveStyle({ padding: '0px' });
  });

  it('renders BackLink and navigates back in history on click when backLink is true', () => {
    const history = createMemoryHistory({
      initialEntries: ['/previous-page', '/current-page'],
      initialIndex: 1,
    });
    expect(history.location.pathname).toBe('/current-page');

    renderSectionBoxWithHistory(
      {
        backLink: true,
        title: 'Section With History BackLink',
        children: <div>Content</div>,
      },
      history
    );

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(history.location.pathname).toBe('/previous-page');
  });

  it('renders BackLink and navigates to the specified path on click when backLink is a custom path string', () => {
    const history = createMemoryHistory({ initialEntries: ['/current-page'] });

    renderSectionBoxWithHistory(
      {
        backLink: '/c/my-cluster/pods',
        title: 'Section With Path BackLink',
        children: <div>Content</div>,
      },
      history
    );

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(history.location.pathname).toBe('/c/my-cluster/pods');
  });

  it('renders BackLink and navigates to the location object on click', () => {
    const history = createMemoryHistory({ initialEntries: ['/current-page'] });
    const targetLocation = {
      pathname: '/c/my-cluster/overview',
      search: '?filter=test',
      state: null,
      hash: '',
    };

    renderSectionBoxWithHistory(
      {
        backLink: targetLocation,
        title: 'Section With Location BackLink',
        children: <div>Content</div>,
      },
      history
    );

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(history.location.pathname).toBe('/c/my-cluster/overview');
    expect(history.location.search).toBe('?filter=test');
  });

  it('does not render BackLink when backLink is false or omitted', () => {
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SectionBox backLink={false} title="No BackLink">
            <div>Content</div>
          </SectionBox>
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SectionBox title="Omitted BackLink">
            <div>Content</div>
          </SectionBox>
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('forwards outterBoxProps to the outer Box container and otherProps to the inner Box', () => {
    renderSectionBox({
      outterBoxProps: { id: 'outer-box-id' },
      id: 'inner-box-id',
      children: <div data-testid="box-content">Content</div>,
    });

    const outerBox = document.getElementById('outer-box-id');
    expect(outerBox).toBeInTheDocument();

    const innerBox = document.getElementById('inner-box-id');
    expect(innerBox).toBeInTheDocument();

    expect(outerBox).toContainElement(innerBox);
    expect(innerBox).toContainElement(screen.getByTestId('box-content'));
  });
});
