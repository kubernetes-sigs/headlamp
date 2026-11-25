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
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../TestHelpers/theme';
import type { PercentageCircleProps } from '../Chart';
import TileChart, { TileChartProps } from './TileChart';

const mockPercentageCircle = vi.fn();

vi.mock('../Chart', () => ({
  PercentageCircle: (props: PercentageCircleProps) => {
    mockPercentageCircle(props);
    return <div data-testid="percentage-circle" />;
  },
}));

vi.mock('../Tooltip', () => ({
  TooltipIcon: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-icon">{children}</span>
  ),
}));

function renderTileChart(props: TileChartProps = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <TileChart {...props} />
    </ThemeProvider>
  );
}

describe('TileChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Title Rendering', () => {
    it('renders a string title', () => {
      renderTileChart({ title: 'CPU Usage' });

      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });

    it('renders custom ReactNode title directly', () => {
      renderTileChart({
        title: <span data-testid="custom-title-node">Cluster Memory</span>,
      });

      expect(screen.getByTestId('custom-title-node')).toBeInTheDocument();
      expect(screen.getByText('Cluster Memory')).toBeInTheDocument();
    });
  });

  describe('Legend Rendering', () => {
    it('renders a string legend', () => {
      renderTileChart({ legend: '4 / 8 cores' });

      expect(screen.getByText('4 / 8 cores')).toBeInTheDocument();
    });

    it('renders custom ReactNode legend directly', () => {
      renderTileChart({
        legend: <strong data-testid="custom-legend">Healthy</strong>,
      });

      expect(screen.getByTestId('custom-legend')).toBeInTheDocument();
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });

  describe('Info Tooltip Icon', () => {
    it('renders TooltipIcon with text when infoTooltip is provided', () => {
      renderTileChart({
        title: 'CPU',
        infoTooltip: 'CPU metrics aggregated over 5 minutes',
      });

      const tooltipIcon = screen.getByTestId('tooltip-icon');
      expect(tooltipIcon).toBeInTheDocument();
      expect(tooltipIcon).toHaveTextContent('CPU metrics aggregated over 5 minutes');
    });

    it.each([
      ['omitted', undefined],
      ['empty string', ''],
      ['null', null],
    ])('does not render TooltipIcon when infoTooltip is %s', (_, infoTooltip) => {
      renderTileChart({ title: 'CPU', infoTooltip });

      expect(screen.queryByTestId('tooltip-icon')).not.toBeInTheDocument();
    });
  });

  describe('Extra Content', () => {
    it('renders extraContent when provided below the legend', () => {
      renderTileChart({
        title: 'Storage',
        legend: '120 GB',
        extraContent: <button data-testid="extra-action">View details</button>,
      });

      const button = screen.getByTestId('extra-action');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('View details');

      const extraContentContainer = button.parentElement;
      expect(screen.getByText('120 GB').nextElementSibling).toBe(extraContentContainer);
    });

    it('does not render the extraContent container when extraContent is omitted', () => {
      renderTileChart({
        title: 'Storage',
        legend: '120 GB',
      });

      expect(screen.getByText('120 GB').nextElementSibling).toBeNull();
    });
  });

  describe('PercentageCircle Rendering', () => {
    it('renders PercentageCircle when data is provided', () => {
      const data = [{ name: 'used', value: 45 }];
      renderTileChart({
        title: 'Memory',
        data,
        total: 100,
        label: '45%',
      });

      const chart = screen.getByTestId('percentage-circle');
      expect(chart).toBeInTheDocument();
      expect(mockPercentageCircle).toHaveBeenCalledTimes(1);

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.data).toEqual(data);
      expect(passedProps.total).toBe(100);
      expect(passedProps.size).toBe(140);
      expect(passedProps.thickness).toBe(11);
      expect(passedProps.label).toBe('45%');
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
    ])('does not render PercentageCircle when data is %s', (_, data) => {
      renderTileChart({ title: 'Memory', data });

      expect(screen.queryByTestId('percentage-circle')).not.toBeInTheDocument();
      expect(mockPercentageCircle).not.toHaveBeenCalled();
    });

    it('forwards additional props to PercentageCircle via others', () => {
      renderTileChart({
        title: 'Network',
        data: [{ name: 'in', value: 10 }],
        dataKey: 'customKey',
        role: 'img',
      } as any);

      expect(mockPercentageCircle).toHaveBeenCalledTimes(1);
      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.dataKey).toBe('customKey');
      expect(passedProps.role).toBe('img');
    });
  });

  describe('Loader Title Resolution (resolvedLoadingTitle)', () => {
    it('prioritizes explicit loaderTitle when provided', () => {
      renderTileChart({
        title: 'CPU',
        label: '50%',
        loaderTitle: 'Custom CPU Loader',
        data: [{ name: 'used', value: 50 }],
      });

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.loaderTitle).toBe('Custom CPU Loader');
    });

    it('falls back to trimmed string title when loaderTitle is not provided', () => {
      renderTileChart({
        title: '   Pods Status   ',
        label: '8/10',
        data: [{ name: 'ready', value: 8 }],
      });

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.loaderTitle).toBe('Pods Status');
    });

    it('falls back to trimmed string label when title is empty/whitespace string', () => {
      renderTileChart({
        title: '   ',
        label: '  90%  ',
        data: [{ name: 'used', value: 90 }],
      });

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.loaderTitle).toBe('90%');
    });

    it('falls back to trimmed string label when title is a custom ReactNode', () => {
      renderTileChart({
        title: <span>Custom Title Node</span>,
        label: '75%',
        data: [{ name: 'used', value: 75 }],
      });

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.loaderTitle).toBe('75%');
    });

    it('ignores loading ellipsis "…" in label and resolves to undefined', () => {
      renderTileChart({
        title: <span>Node Title</span>,
        label: '…',
        data: [{ name: 'used', value: 0 }],
      });

      const passedProps = mockPercentageCircle.mock.calls[0][0];
      expect(passedProps.loaderTitle).toBeUndefined();
    });

    it.each([
      ['omitted', undefined],
      ['empty string', ''],
      ['whitespace-only string', '   '],
    ])(
      'resolves loaderTitle to undefined when label is %s and title has no candidate',
      (_, label) => {
        renderTileChart({
          label,
          data: [{ name: 'used', value: 10 }],
        });

        const passedProps = mockPercentageCircle.mock.calls[0][0];
        expect(passedProps.loaderTitle).toBeUndefined();
      }
    );
  });
});
