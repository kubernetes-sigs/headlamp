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
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import NameValueTable, { NameValueTableProps } from './NameValueTable';

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderNameValueTable(props: NameValueTableProps) {
  return render(
    <ThemeProvider theme={theme}>
      <NameValueTable {...props} />
    </ThemeProvider>
  );
}

describe('NameValueTable', () => {
  it('renders a semantic definition list (<dl>) with <dt> and <dd> elements', () => {
    const { container } = renderNameValueTable({
      rows: [
        { name: 'Cluster Name', value: 'production-us-east' },
        { name: 'Namespace', value: 'default' },
      ],
    });

    const dlElement = container.querySelector('dl');
    expect(dlElement).toBeInTheDocument();

    const dtElements = container.querySelectorAll('dt');
    expect(dtElements).toHaveLength(2);
    expect(dtElements[0]).toHaveTextContent('Cluster Name');
    expect(dtElements[1]).toHaveTextContent('Namespace');

    const ddElements = container.querySelectorAll('dd');
    expect(ddElements).toHaveLength(2);
    expect(ddElements[0]).toHaveTextContent('production-us-east');
    expect(ddElements[1]).toHaveTextContent('default');
  });

  describe('Value formatting', () => {
    it('renders plain string values wrapped in ValueLabel', () => {
      renderNameValueTable({
        rows: [{ name: 'Kind', value: 'Deployment' }],
      });

      const valueElement = screen.getByText('Deployment');
      expect(valueElement).toBeInTheDocument();
      // ValueLabel renders as Typography component="span"
      expect(valueElement.tagName).toBe('SPAN');
    });

    it('renders array values sequentially within the value cell', () => {
      renderNameValueTable({
        rows: [
          {
            name: 'Labels',
            value: ['app=headlamp', 'tier=frontend', 'env=prod'],
          },
        ],
      });

      expect(screen.getByText('app=headlamp')).toBeInTheDocument();
      expect(screen.getByText('tier=frontend')).toBeInTheDocument();
      expect(screen.getByText('env=prod')).toBeInTheDocument();
    });

    it('renders custom ReactNode values directly', () => {
      renderNameValueTable({
        rows: [
          {
            name: 'Actions',
            value: (
              <button type="button" data-testid="custom-action-btn">
                Restart Pod
              </button>
            ),
          },
        ],
      });

      const button = screen.getByTestId('custom-action-btn');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Restart Pod');
    });

    it('renders an empty value cell when value is undefined', () => {
      const { container } = renderNameValueTable({
        rows: [{ name: 'Annotations', value: undefined }],
      });

      const dt = container.querySelector('dt');
      const dd = container.querySelector('dd');
      expect(dt).toHaveTextContent('Annotations');
      expect(dd).toBeInTheDocument();
      expect(dd).toBeEmptyDOMElement();
    });
  });

  describe('Row visibility filtering (hide)', () => {
    it('omits rows where hide is true and renders rows where hide is false or omitted', () => {
      renderNameValueTable({
        rows: [
          { name: 'Visible Row 1', value: 'Value 1' },
          { name: 'Hidden Row', value: 'Hidden Value', hide: true },
          { name: 'Visible Row 2', value: 'Value 2', hide: false },
        ],
      });

      expect(screen.getByText('Visible Row 1')).toBeInTheDocument();
      expect(screen.getByText('Value 1')).toBeInTheDocument();
      expect(screen.queryByText('Hidden Row')).not.toBeInTheDocument();
      expect(screen.queryByText('Hidden Value')).not.toBeInTheDocument();
      expect(screen.getByText('Visible Row 2')).toBeInTheDocument();
      expect(screen.getByText('Value 2')).toBeInTheDocument();
    });

    it('evaluates callback function for hide prop based on row value', () => {
      const isInternal = (val: React.ReactNode) => val === 'internal-value';

      renderNameValueTable({
        rows: [
          { name: 'Public Config', value: 'public-value', hide: isInternal },
          { name: 'Secret Token', value: 'internal-value', hide: isInternal },
        ],
      });

      expect(screen.getByText('Public Config')).toBeInTheDocument();
      expect(screen.getByText('public-value')).toBeInTheDocument();
      expect(screen.queryByText('Secret Token')).not.toBeInTheDocument();
      expect(screen.queryByText('internal-value')).not.toBeInTheDocument();
    });
  });

  describe('Highlight section styling (withHighlightStyle)', () => {
    it('renders name spanning full width without a value grid item when withHighlightStyle is true and value is absent', () => {
      const { container } = renderNameValueTable({
        rows: [
          {
            name: 'Section Header Title',
            withHighlightStyle: true,
          },
          {
            name: 'Regular Name',
            value: 'Regular Value',
          },
        ],
      });

      const headerDt = screen.getByText('Section Header Title');
      expect(headerDt).toBeInTheDocument();
      expect(headerDt.tagName).toBe('DT');
      expect(headerDt).toHaveStyle({ fontWeight: '700' });
      expect(headerDt).toHaveClass(
        'MuiGrid-grid-xs-12',
        'MuiGrid-grid-sm-12',
        'MuiGrid-grid-md-12'
      );

      // Only one dd should exist (for the second row)
      const ddElements = container.querySelectorAll('dd');
      expect(ddElements).toHaveLength(1);
      expect(ddElements[0]).toHaveTextContent('Regular Value');
    });

    it('renders both name and value with highlight styling when value is present and withHighlightStyle is true', () => {
      const { container } = renderNameValueTable({
        rows: [
          {
            name: 'Important Setting',
            value: 'Critical Value',
            withHighlightStyle: true,
          },
        ],
      });

      const dt = container.querySelector('dt');
      const dd = container.querySelector('dd');

      expect(dt).toHaveTextContent('Important Setting');
      expect(dt).toHaveStyle({ fontWeight: '700' });
      expect(dd).toHaveTextContent('Critical Value');
      expect(dd).toHaveStyle({ fontWeight: '700' });
    });
  });

  describe('Full row value layout (valueFullRow)', () => {
    it('suppresses bottom border on dt when valueFullRow is true', () => {
      const { container } = renderNameValueTable({
        rows: [
          {
            name: 'Description',
            value: 'Full width description text spanning below the label.',
            valueFullRow: true,
          },
          {
            name: 'Next Item',
            value: 'Next Value',
          },
        ],
      });

      const dtElements = container.querySelectorAll('dt');
      expect(dtElements[0]).toHaveStyle({ borderBottom: 'none' });
      expect(container.querySelector('dd')).toHaveClass(
        'MuiGrid-grid-xs-12',
        'MuiGrid-grid-sm-12',
        'MuiGrid-grid-md-12'
      );
    });
  });

  describe('Accessibility (nameID)', () => {
    it('attaches the nameID to the dt element for accessibility labelling', () => {
      renderNameValueTable({
        rows: [
          {
            name: 'Cluster Status',
            nameID: 'cluster-status-label-id',
            value: 'Ready',
          },
        ],
      });

      const dtElement = document.getElementById('cluster-status-label-id');
      expect(dtElement).toBeInTheDocument();
      expect(dtElement?.tagName).toBe('DT');
      expect(dtElement).toHaveTextContent('Cluster Status');
    });
  });

  describe('Props forwarding', () => {
    it('forwards table-level globalValueCellProps and row-level valueCellProps to dd', () => {
      const { container } = renderNameValueTable({
        valueCellProps: {
          className: 'global-custom-class',
          'data-testid': 'global-cell',
        } as any,
        rows: [
          {
            name: 'First Row',
            value: 'Row 1 Value',
          },
          {
            name: 'Second Row',
            value: 'Row 2 Value',
            valueCellProps: {
              'data-testid': 'specific-row-cell',
            } as any,
          },
        ],
      });

      const dtElements = container.querySelectorAll('dt');
      // globalValueCellProps className is forwarded to dt
      expect(dtElements[0]).toHaveClass('global-custom-class');

      const ddElements = container.querySelectorAll('dd');
      expect(ddElements[0]).toHaveAttribute('data-testid', 'global-cell');
      // Second row-level valueCellProps overrides data-testid
      expect(ddElements[1]).toHaveAttribute('data-testid', 'specific-row-cell');
    });
  });

  describe('Border calculation for last visible child', () => {
    it('suppresses bottom border on the last visible row even when followed by hidden rows', () => {
      const { container } = renderNameValueTable({
        rows: [
          { name: 'Row 1', value: 'Value 1' },
          { name: 'Row 2', value: 'Value 2' },
          { name: 'Row 3 (Hidden)', value: 'Value 3', hide: true },
          { name: 'Row 4 (Hidden)', value: 'Value 4', hide: () => true },
        ],
      });

      const dtElements = container.querySelectorAll('dt');
      const ddElements = container.querySelectorAll('dd');

      expect(dtElements).toHaveLength(2);
      expect(ddElements).toHaveLength(2);

      // The last visible row (Row 2) must not have a bottom border
      expect(dtElements[1]).toHaveStyle({ borderBottom: 'none' });
      expect(ddElements[1]).toHaveStyle({ borderBottom: 'none' });
    });
  });
});
