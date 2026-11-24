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

import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { TestContext } from '../../test';
import { theme } from '../TestHelpers/theme';
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

function renderSectionHeader(props: SectionHeaderProps) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <SectionHeader {...props} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('SectionHeader', () => {
  describe('Title & HeaderStyle variants', () => {
    it('renders title as h1 variant by default (headerStyle="main")', () => {
      renderSectionHeader({ title: 'Main Title' });

      const heading = screen.getByRole('heading', { level: 1, name: 'Main Title' });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('MuiTypography-h1');
    });

    it('renders title as h2 variant when headerStyle="subsection"', () => {
      renderSectionHeader({ title: 'Subsection Title', headerStyle: 'subsection' });

      const heading = screen.getByRole('heading', { level: 2, name: 'Subsection Title' });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('MuiTypography-h2');
    });

    it('renders title as h3 variant when headerStyle="normal"', () => {
      renderSectionHeader({ title: 'Normal Title', headerStyle: 'normal' });

      const heading = screen.getByRole('heading', { level: 3, name: 'Normal Title' });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('MuiTypography-h3');
    });

    it('renders title as h4 variant when headerStyle="label"', () => {
      renderSectionHeader({ title: 'Label Title', headerStyle: 'label' });

      const heading = screen.getByRole('heading', { level: 4, name: 'Label Title' });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('MuiTypography-h4');
    });

    it('renders custom ReactNode title directly', () => {
      renderSectionHeader({
        title: <span data-testid="custom-title-node">Custom Node Title</span>,
      });

      expect(screen.getByTestId('custom-title-node')).toBeInTheDocument();
      expect(screen.getByText('Custom Node Title')).toBeInTheDocument();
    });

    it('falls back to normal headerStyle styling when headerStyle is falsy', () => {
      renderSectionHeader({ title: 'Fallback Style Title', headerStyle: '' as any });

      const heading = screen.getByText('Fallback Style Title');
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveStyle(theme.palette.headerStyle.normal);
    });

    it('does not render heading Typography when title is omitted', () => {
      renderSectionHeader({ title: '' });

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  describe('Subtitle rendering', () => {
    it('renders subtitle string with variant h6 and italic styling', () => {
      renderSectionHeader({
        title: 'Cluster Overview',
        subtitle: 'Details and health metrics for this cluster',
      });

      const subtitleElement = screen.getByText('Details and health metrics for this cluster');
      expect(subtitleElement).toBeInTheDocument();
      expect(subtitleElement.tagName).toBe('P');
      expect(subtitleElement).toHaveClass('MuiTypography-h6');
      expect(subtitleElement).toHaveStyle({ fontStyle: 'italic' });
    });

    it('renders custom ReactNode subtitle', () => {
      renderSectionHeader({
        title: 'Pods',
        subtitle: <span data-testid="custom-subtitle-node">Active pods in namespace</span>,
      });

      expect(screen.getByTestId('custom-subtitle-node')).toBeInTheDocument();
      expect(screen.getByText('Active pods in namespace')).toBeInTheDocument();
    });

    it('does not render subtitle element when subtitle prop is not provided', () => {
      const { container } = renderSectionHeader({ title: 'Deployments' });

      expect(container.querySelector('p.MuiTypography-h6')).not.toBeInTheDocument();
    });
  });

  describe('Title Side Actions (titleSideActions)', () => {
    it('renders titleSideActions next to the title in the flex container', () => {
      renderSectionHeader({
        title: 'Namespaces',
        titleSideActions: [
          <Chip key="chip" label="Active" data-testid="side-chip" />,
          <Button key="btn" data-testid="side-button">
            Create
          </Button>,
        ],
      });

      const heading = screen.getByRole('heading', { level: 1, name: 'Namespaces' });
      expect(heading).toBeInTheDocument();

      const chip = screen.getByTestId('side-chip');
      const button = screen.getByTestId('side-button');
      expect(chip).toBeInTheDocument();
      expect(button).toBeInTheDocument();

      // Verify side actions are inside a sibling container to the title
      const titleBox = heading.parentElement;
      expect(titleBox).toContainElement(chip);
      expect(titleBox).toContainElement(button);
      expect(titleBox).toHaveStyle({ display: 'flex', alignItems: 'center' });
      expect(titleBox).not.toHaveStyle({ flexDirection: 'column' });
      expect(titleBox).not.toHaveStyle({ flexDirection: 'column-reverse' });
    });

    it('renders titleSideActions properly even when title is absent', () => {
      renderSectionHeader({
        title: '',
        titleSideActions: [<Chip key="chip" label="Beta" data-testid="isolated-side-action" />],
      });

      expect(screen.getByTestId('isolated-side-action')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  describe('Header Actions (actions)', () => {
    it('renders right-aligned action elements in the header action container', () => {
      renderSectionHeader({
        title: 'Storage',
        actions: [
          <Button key="act-1" data-testid="action-btn-1">
            Action 1
          </Button>,
          <Button key="act-2" data-testid="action-btn-2">
            Action 2
          </Button>,
        ],
      });

      const firstAction = screen.getByTestId('action-btn-1');
      const secondAction = screen.getByTestId('action-btn-2');
      expect(firstAction).toBeInTheDocument();
      expect(secondAction).toBeInTheDocument();
      const actionContainer = firstAction.closest('.MuiGrid-container');
      expect(actionContainer).toContainElement(secondAction);
      expect(actionContainer).toHaveStyle({ justifyContent: 'flex-end' });
    });

    it('does not render actions container when actions is omitted or empty', () => {
      const { container } = renderSectionHeader({
        title: 'Nodes',
        actions: [],
      });

      // When actions is empty array, only the left grid item containing the title should exist
      const actionContainers = container.querySelectorAll('.MuiGrid-container');
      // The outer Grid is a container, but inner action Grid container should not exist
      expect(actionContainers).toHaveLength(1);
    });

    it('does not render actions container when actions is null', () => {
      const { container } = renderSectionHeader({
        title: 'Nodes',
        actions: null,
      });

      const actionContainers = container.querySelectorAll('.MuiGrid-container');
      expect(actionContainers).toHaveLength(1);
    });
  });

  describe('Padding control (noPadding)', () => {
    it('applies standard theme padding when noPadding is omitted or false', () => {
      renderSectionHeader({ title: 'Default Padding Header' });

      const heading = screen.getByRole('heading', { level: 1, name: 'Default Padding Header' });
      const gridContainer = heading.closest('.MuiGrid-container');

      // theme.spacing(2) -> 16px, theme.spacing(3) -> 24px
      expect(gridContainer).toHaveStyle({
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingBottom: '16px',
        paddingTop: '24px',
      });
    });

    it('removes padding (padding: 0) when noPadding is true', () => {
      renderSectionHeader({ title: 'Zero Padding Header', noPadding: true });

      const heading = screen.getByRole('heading', { level: 1, name: 'Zero Padding Header' });
      const gridContainer = heading.closest('.MuiGrid-container');

      expect(gridContainer).toHaveStyle({
        padding: '0px',
      });
    });
  });

  describe('Suppression of title container', () => {
    it('does not render title Box when neither title nor titleSideActions are provided', () => {
      const { container } = renderSectionHeader({
        title: '',
        titleSideActions: [],
        subtitle: 'Only Subtitle Provided',
      });

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.getByText('Only Subtitle Provided')).toBeInTheDocument();

      // Verify no display="flex" box for title exists
      const flexBoxes = container.querySelectorAll('.MuiBox-root');
      expect(flexBoxes).toHaveLength(0);
    });
  });
});
