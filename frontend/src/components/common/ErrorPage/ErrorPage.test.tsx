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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorComponent from './ErrorPage';

const { mockEnqueueSnackbar } = vi.hoisted(() => ({
  mockEnqueueSnackbar: vi.fn(),
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}));

describe('ErrorComponent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockEnqueueSnackbar.mockReset();
  });

  it('shows the default error content', () => {
    const { container } = render(<ErrorComponent />);

    expect(screen.getByRole('heading', { name: 'Uh-oh! Something went wrong.' })).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('headlamp-broken.svg')
    );
    expect(screen.getByRole('link', { name: 'home' })).toHaveClass('MuiLink-underlineAlways');
  });

  it('shows product-specific error content', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_ERROR_PAGE_TITLE', 'Product error');
    vi.stubEnv('REACT_APP_HEADLAMP_ERROR_PAGE_GRAPHIC', '/product/error.svg');

    const { container } = render(<ErrorComponent />);

    expect(screen.getByRole('heading', { name: 'Product error' })).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute('src', '/product/error.svg');
  });

  it('prefers explicit content over product defaults', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_ERROR_PAGE_TITLE', 'Product error');
    vi.stubEnv('REACT_APP_HEADLAMP_ERROR_PAGE_GRAPHIC', '/product/error.svg');

    const { container } = render(
      <ErrorComponent title="Request error" graphic="/request/error.svg" />
    );

    expect(screen.getByRole('heading', { name: 'Request error' })).toBeVisible();
    expect(container.querySelector('img')).toHaveAttribute('src', '/request/error.svg');
  });

  it('renders explicit content without typography or an image', () => {
    render(
      <ErrorComponent
        title={<span>Plain title</span>}
        message={<span>Plain message</span>}
        graphic={<span>Plain graphic</span>}
        withTypography={false}
      />
    );

    expect(screen.getByText('Plain title')).toBeVisible();
    expect(screen.getByText('Plain message')).toBeVisible();
    expect(screen.getByText('Plain graphic')).toBeVisible();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders an explicit message with typography', () => {
    render(<ErrorComponent message="Try again later" />);

    expect(screen.getByRole('heading', { name: 'Try again later' })).toBeVisible();
  });

  it('copies error details', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const error = new Error('Request failed');
    error.stack = 'Request stack';

    render(<ErrorComponent error={error} />);
    await user.click(screen.getByRole('button', { name: /Error Details$/ }));
    await user.click(screen.getByRole('button', { name: /Copy$/ }));

    expect(writeText).toHaveBeenCalledWith('Request stack');
    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('translation|Copied to clipboard', {
        variant: 'success',
      })
    );
  });

  it('reports clipboard failures', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) },
    });
    const error = new Error('Request failed');
    error.stack = 'Request stack';

    render(<ErrorComponent error={error} />);
    await user.click(screen.getByRole('button', { name: /Error Details$/ }));
    await user.click(screen.getByRole('button', { name: /Copy$/ }));

    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('translation|Failed to copy to clipboard', {
        variant: 'error',
      })
    );
  });

  it('reports a truncated error when the issue popup is blocked', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const error = new Error(`Request\n${'failed'.repeat(20)}`);
    error.stack = 'x'.repeat(1001);

    render(<ErrorComponent error={error} />);
    await user.click(screen.getByRole('button', { name: /Error Details$/ }));
    await user.click(screen.getByRole('button', { name: /Open Issue on GitHub$/ }));

    const issueUrl = new URL(open.mock.calls[0][0] as string);
    expect(issueUrl.origin + issueUrl.pathname).toBe(
      'https://github.com/kubernetes-sigs/headlamp/issues/new'
    );
    expect(issueUrl.searchParams.get('labels')).toBe('kind/bug');
    expect(issueUrl.searchParams.get('title')).toContain('Crash Report: Request failed');
    expect(issueUrl.searchParams.get('body')).toContain('... (truncated)');
    expect(issueUrl.searchParams.get('body')).toContain('Headlamp Version\n');
    expect(issueUrl.searchParams.get('body')).toContain('Git Commit\n');
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      'translation|Unable to open GitHub. Please check your popup blocker settings or copy the error details manually.',
      { variant: 'warning' }
    );
  });

  it('opens an issue with fallback error text and configured versions', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '1.2.3');
    vi.stubEnv('REACT_APP_HEADLAMP_GIT_VERSION', 'abc123');
    const error = new Error('');
    error.stack = 'Short stack';

    render(<ErrorComponent error={error} />);
    await user.click(screen.getByRole('button', { name: /Error Details$/ }));
    await user.click(screen.getByRole('button', { name: /Open Issue on GitHub$/ }));

    const issueUrl = new URL(open.mock.calls[0][0] as string);
    expect(issueUrl.searchParams.get('title')).toContain('Crash Report: Application Error');
    expect(issueUrl.searchParams.get('body')).toContain('An error occurred in the application');
    expect(issueUrl.searchParams.get('body')).toContain('Headlamp Version\n1.2.3');
    expect(issueUrl.searchParams.get('body')).toContain('Git Commit\nabc123');
    expect(mockEnqueueSnackbar).not.toHaveBeenCalled();
  });

  it.each(['github.com/example/product/issues/new', 'file:///tmp/product/issues/new'])(
    'warns instead of opening an invalid product issue URL: %s',
    async issueUrl => {
      const user = userEvent.setup();
      const open = vi.spyOn(window, 'open').mockReturnValue(window);
      vi.stubEnv('REACT_APP_HEADLAMP_ERROR_REPORT_GITHUB_URL', issueUrl);
      const error = new Error('Product failed');
      error.stack = 'Product stack';

      render(<ErrorComponent error={error} />);
      await user.click(screen.getByRole('button', { name: /Error Details$/ }));
      await user.click(screen.getByRole('button', { name: /Open Issue on GitHub$/ }));

      expect(open).not.toHaveBeenCalled();
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        'translation|Unable to open GitHub. Please check your popup blocker settings or copy the error details manually.',
        { variant: 'warning' }
      );
    }
  );

  it('uses the product-configured GitHub issue URL and button label', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    vi.stubEnv(
      'REACT_APP_HEADLAMP_ERROR_REPORT_GITHUB_URL',
      'https://github.com/example/product/issues/new?labels=product-bug&template=crash.yml'
    );
    vi.stubEnv('REACT_APP_HEADLAMP_ERROR_REPORT_BUTTON_LABEL', 'Contact us');
    const error = new Error('Product failed');
    error.stack = 'Product stack';

    render(<ErrorComponent error={error} />);
    await user.click(screen.getByRole('button', { name: /Error Details$/ }));
    await user.click(screen.getByRole('button', { name: 'Contact us' }));

    const issueUrl = new URL(open.mock.calls[0][0] as string);
    expect(issueUrl.origin + issueUrl.pathname).toBe(
      'https://github.com/example/product/issues/new'
    );
    expect(issueUrl.searchParams.get('labels')).toBe('product-bug');
    expect(issueUrl.searchParams.get('template')).toBe('crash.yml');
    expect(issueUrl.searchParams.get('title')).toBe('Crash Report: Product failed');
    expect(issueUrl.searchParams.get('body')).toContain('Product stack');
  });
});
