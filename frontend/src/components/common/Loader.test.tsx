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

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestContext } from '../../test';
import Loader from './Loader';

describe('Loader Component', () => {
  it('renders with default props and container', () => {
    render(
      <TestContext>
        <Loader title="Loading..." />
      </TestContext>
    );

    // Check if the container Box is present
    const container = screen.getByRole('progressbar').parentElement;
    expect(container).toHaveClass('MuiBox-root');

    // Check if CircularProgress is rendered
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('MuiCircularProgress-root');
    expect(progress).toHaveAttribute('title', 'Loading...');
  });

  it('renders without container when noContainer is true', () => {
    render(
      <TestContext>
        <Loader title="Loading..." noContainer />
      </TestContext>
    );

    // Check if CircularProgress is rendered directly without container
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('MuiCircularProgress-root');
    expect(progress.parentElement).not.toHaveClass('MuiBox-root');
  });

  it('renders with custom size', () => {
    const customSize = 80;
    render(
      <TestContext>
        <Loader title="Loading..." size={customSize} />
      </TestContext>
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveStyle({ width: `${customSize}px`, height: `${customSize}px` });
  });

  it('renders with custom color', () => {
    render(
      <TestContext>
        <Loader title="Loading..." color="secondary" />
      </TestContext>
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('MuiCircularProgress-colorSecondary');
  });
  it('uses title as aria-label when provided', () => {
    render(
      <TestContext>
        <Loader title="Fetching data..." />
      </TestContext>
    );

    const progress = screen.getByRole('progressbar');
    // Verify the explicit title is used as the accessible label
    expect(progress).toHaveAttribute('title', 'Fetching data...');
    expect(progress).toHaveAttribute('aria-label', 'Fetching data...');
  });
  it('uses translated fallback aria-label when title is empty', () => {
    render(
      <TestContext>
        <Loader title="" />
      </TestContext>
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('title', 'Loading...');
    expect(progress).toHaveAttribute('aria-label', 'Loading...');
  });

  it('passes additional props to CircularProgress', () => {
    render(
      <TestContext>
        <Loader title="Loading..." thickness={4} disableShrink />
      </TestContext>
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('MuiCircularProgress-root');
    expect(progress).toHaveAttribute('role', 'progressbar');
    expect(progress).toHaveAttribute('title', 'Loading...');
  });
});
