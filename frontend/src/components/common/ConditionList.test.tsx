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
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { KubeCondition, PodCondition, WorkloadCondition } from '../../lib/k8s/cluster';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { ConditionList, getReadyCondition } from './ConditionList';

// Mock translation to strip the namespace prefix and yield human-readable column headers
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.replace(/^(glossary|translation)\|/, ''),
  }),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

/**
 * Factory helper for constructing mock KubeCondition objects.
 * Pod conditions include a required probe timestamp that is not rendered by ConditionList.
 */
function createMockCondition(
  overrides: Partial<PodCondition> & { type: string; status: string }
): PodCondition {
  return {
    lastProbeTime: null,
    ...overrides,
  };
}

function createMockWorkloadCondition(
  overrides: Partial<WorkloadCondition> & { type: string; status: string }
): WorkloadCondition {
  return overrides;
}

/**
 * Helper to render ConditionList wrapped with Headlamp's ThemeProvider and TestContext.
 * SimpleTable relies on MUI theme tokens and Redux store providers.
 */
function renderConditionList(
  conditions: KubeCondition[] | undefined | null,
  showLastUpdate?: boolean
) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ConditionList conditions={conditions} showLastUpdate={showLastUpdate} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('getReadyCondition', () => {
  it('keeps generic lastProbeTime access compatible with node conditions', () => {
    const condition: KubeCondition = {
      type: 'Ready',
      status: 'True',
      lastHeartbeatTime: '2026-01-01T00:00:00Z',
    };

    expect(condition.lastProbeTime).toBeUndefined();
  });

  it('keeps legacy generic condition fields assignable', () => {
    const condition: KubeCondition = {
      type: 'Ready',
      status: 'True',
      lastProbeTime: null,
      lastUpdateTime: 0,
    };

    expect(condition.lastProbeTime).toBeNull();
    expect(condition.lastUpdateTime).toBe(0);
  });

  it('returns the condition whose type is Ready from a multi-condition list', () => {
    const conditions: KubeCondition[] = [
      createMockCondition({ type: 'PodScheduled', status: 'True' }),
      createMockCondition({ type: 'Initialized', status: 'True' }),
      createMockCondition({ type: 'Ready', status: 'True', reason: 'PodReady' }),
      createMockCondition({ type: 'ContainersReady', status: 'True' }),
    ];

    const result = getReadyCondition(conditions);
    expect(result).toBeDefined();
    expect(result?.type).toBe('Ready');
    expect(result?.reason).toBe('PodReady');
  });

  it('returns undefined if no Ready condition exists in the array', () => {
    const conditions: KubeCondition[] = [
      createMockCondition({ type: 'PodScheduled', status: 'True' }),
      createMockCondition({ type: 'Initialized', status: 'True' }),
    ];

    expect(getReadyCondition(conditions)).toBeUndefined();
  });

  it('returns undefined when conditions array is empty', () => {
    expect(getReadyCondition([])).toBeUndefined();
  });

  it('returns undefined when conditions is null or undefined', () => {
    expect(getReadyCondition(null)).toBeUndefined();
    expect(getReadyCondition(undefined)).toBeUndefined();
  });
});

describe('ConditionList', () => {
  describe('Lifecycle and null-safety', () => {
    it('renders null when conditions is null', () => {
      const { container } = renderConditionList(null);
      expect(container.firstChild).toBeNull();
    });

    it('renders null when conditions is undefined', () => {
      const { container } = renderConditionList(undefined);
      expect(container.firstChild).toBeNull();
    });

    it('renders null when conditions array is empty', () => {
      const { container } = renderConditionList([]);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Column visibility and toggling', () => {
    const mockConditions: KubeCondition[] = [
      createMockWorkloadCondition({
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-01-01T00:00:00Z',
        lastUpdateTime: '2026-01-01T01:00:00Z',
        reason: 'PodReady',
        message: 'Pod is ready',
      }),
    ];

    it('hides Last Update column by default when showLastUpdate is not specified', () => {
      renderConditionList(mockConditions);

      expect(screen.getByRole('columnheader', { name: 'Condition' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Last Transition' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();

      expect(screen.queryByRole('columnheader', { name: 'Last Update' })).not.toBeInTheDocument();
    });

    it('displays Last Update column when showLastUpdate is explicitly true', () => {
      renderConditionList(mockConditions, true);

      expect(screen.getByRole('columnheader', { name: 'Condition' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Last Transition' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Last Update' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Reason' })).toBeInTheDocument();
    });
  });

  describe('Status color mapping', () => {
    it('maps status="True" to success label, "False" to error label, and "Unknown" to neutral label', () => {
      const conditions: KubeCondition[] = [
        createMockWorkloadCondition({
          type: 'Ready',
          status: 'True',
          reason: 'PodReady',
        }),
        createMockWorkloadCondition({
          type: 'ContainersReady',
          status: 'False',
          reason: 'ContainersNotReady',
        }),
        createMockWorkloadCondition({
          type: 'DisruptionAllowed',
          status: 'Unknown',
          reason: 'Calculating',
        }),
        createMockWorkloadCondition({
          type: 'CustomCondition',
          status: 'CustomStatus',
          reason: 'CustomReason',
        }),
      ];

      renderConditionList(conditions);

      // Verify condition names rendered in the table
      const readyLabel = screen.getByText('Ready');
      const containersReadyLabel = screen.getByText('ContainersReady');
      const disruptionLabel = screen.getByText('DisruptionAllowed');
      const customLabel = screen.getByText('CustomCondition');

      expect(readyLabel).toBeInTheDocument();
      expect(containersReadyLabel).toBeInTheDocument();
      expect(disruptionLabel).toBeInTheDocument();
      expect(customLabel).toBeInTheDocument();

      // Status values in Status column
      expect(screen.getByText('True')).toBeInTheDocument();
      expect(screen.getByText('False')).toBeInTheDocument();
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      expect(screen.getByText('CustomStatus')).toBeInTheDocument();

      // Verify theme colors applied by statusFromCondition
      // Status 'True' -> status="success" -> distinct success background color
      const successBg = (theme.palette.success as any)[800] ?? theme.palette.success.main;
      expect(readyLabel).toHaveStyle({
        backgroundColor: successBg,
      });

      // Status 'False' -> status="error" -> distinct error background color
      const errorBg = (theme.palette.error as any)[800] ?? theme.palette.error.main;
      expect(containersReadyLabel).toHaveStyle({
        backgroundColor: errorBg,
      });

      // Status 'Unknown' and non-standard -> status="" -> neutral muted background & text primary color
      expect(disruptionLabel).toHaveStyle({
        backgroundColor: theme.palette.background.muted,
        color: theme.palette.text.primary,
      });
      expect(customLabel).toHaveStyle({
        backgroundColor: theme.palette.background.muted,
        color: theme.palette.text.primary,
      });
    });

    it('colors negative ReplicaFailure condition with status="True" as error and "False" as success', () => {
      const conditions: KubeCondition[] = [
        createMockCondition({
          type: 'ReplicaFailure',
          status: 'True',
          reason: 'QuotaExceeded',
        }),
        createMockCondition({
          type: 'replicafailure',
          status: 'False',
          reason: 'PodsCreated',
        }),
      ];

      renderConditionList(conditions);

      const replicaFailureLabels = screen.getAllByText(/ReplicaFailure/i);
      expect(replicaFailureLabels).toHaveLength(2);

      const errorBg = (theme.palette.error as any)[800] ?? theme.palette.error.main;
      const successBg = (theme.palette.success as any)[800] ?? theme.palette.success.main;

      // ReplicaFailure=True is an error
      expect(replicaFailureLabels[0]).toHaveStyle({
        backgroundColor: errorBg,
      });

      // replicafailure=False (case-insensitive) is success
      expect(replicaFailureLabels[1]).toHaveStyle({
        backgroundColor: successBg,
      });
    });
  });

  describe('Cell formatters and fallback handling', () => {
    it('renders formatted DateLabel when timestamps are provided', () => {
      const conditions: KubeCondition[] = [
        createMockWorkloadCondition({
          type: 'Ready',
          status: 'True',
          lastTransitionTime: '2026-01-01T12:00:00Z',
          lastUpdateTime: '2026-01-01T12:30:00Z',
          reason: 'PodReady',
        }),
      ];

      renderConditionList(conditions, true);

      const cells = screen.getAllByRole('cell');
      // Cell 0: Condition (Ready)
      // Cell 1: Status (True)
      // Cell 2: Last Transition (DateLabel)
      // Cell 3: Last Update (DateLabel)
      // Cell 4: Reason (PodReady)

      // Cell 2: renders relative time '90d', calendar icon, and tooltip carrying the ISO timestamp
      expect(cells[2].textContent).toBe('90d');
      expect(cells[2].querySelector('p')).toHaveAttribute('aria-label', '2026-01-01T12:00:00.000Z');
      expect(cells[2].querySelector('span')).toBeInTheDocument();

      // Cell 3: renders relative time '90d', calendar icon, and tooltip carrying the ISO timestamp
      expect(cells[3].textContent).toBe('90d');
      expect(cells[3].querySelector('p')).toHaveAttribute('aria-label', '2026-01-01T12:30:00.000Z');
      expect(cells[3].querySelector('span')).toBeInTheDocument();
    });

    it('renders hyphen fallback "-" when timestamps are null or undefined', () => {
      const conditions: KubeCondition[] = [
        createMockWorkloadCondition({
          type: 'Ready',
          status: 'True',
          lastTransitionTime: null as any,
          lastUpdateTime: undefined,
          reason: 'PodReady',
        }),
      ];

      renderConditionList(conditions, true);

      const cells = screen.getAllByRole('cell');
      // Last Transition cell should render '-'
      expect(cells[2].textContent).toBe('-');
      // Last Update cell should render '-'
      expect(cells[3].textContent).toBe('-');
    });

    it('renders numeric timestamp zero instead of the missing-value fallback', () => {
      const conditions: KubeCondition[] = [
        createMockWorkloadCondition({
          type: 'Ready',
          status: 'True',
          lastTransitionTime: 0,
          lastUpdateTime: 0,
        }),
      ];

      renderConditionList(conditions, true);

      const cells = screen.getAllByRole('cell');
      expect(cells[2].querySelector('p')).toHaveAttribute('aria-label', '1970-01-01T00:00:00.000Z');
      expect(cells[3].querySelector('p')).toHaveAttribute('aria-label', '1970-01-01T00:00:00.000Z');
    });

    it('renders reason text with tooltip icon and message when reason is present', () => {
      const message = 'All containers have started successfully';
      const conditions: KubeCondition[] = [
        createMockCondition({
          type: 'Ready',
          status: 'True',
          reason: 'PodReady',
          message,
        }),
      ];

      renderConditionList(conditions);

      const reasonElement = screen.getByText('PodReady');
      expect(reasonElement).toBeInTheDocument();
      // Tooltip carries the message in aria-label
      expect(reasonElement).toHaveAttribute('aria-label', message);
      // Contains the information-outline icon
      expect(reasonElement.querySelector('span')).toBeInTheDocument();
    });

    it('renders hyphen fallback "-" when reason is omitted or empty', () => {
      const conditions: KubeCondition[] = [
        createMockCondition({
          type: 'Initialized',
          status: 'True',
          reason: undefined,
        }),
        createMockCondition({
          type: 'PodScheduled',
          status: 'True',
          reason: '',
        }),
      ];

      renderConditionList(conditions);

      const rows = screen.getAllByRole('row');
      // Row 0 is header; verify the Reason cell (column 3) in each data row displays '-'
      const row1Cells = within(rows[1]).getAllByRole('cell');
      expect(row1Cells[3].textContent).toBe('-');

      const row2Cells = within(rows[2]).getAllByRole('cell');
      expect(row2Cells[3].textContent).toBe('-');
    });

    it('renders all rows in matching sequence for multiple conditions', () => {
      const conditions: KubeCondition[] = [
        createMockCondition({ type: 'PodScheduled', status: 'True', reason: 'Scheduled' }),
        createMockCondition({ type: 'Initialized', status: 'True', reason: 'InitDone' }),
        createMockCondition({
          type: 'ContainersReady',
          status: 'True',
          reason: 'ContainersRunning',
        }),
        createMockCondition({ type: 'Ready', status: 'True', reason: 'PodReady' }),
      ];

      renderConditionList(conditions);

      const rows = screen.getAllByRole('row');
      // 1 header row + 4 data rows
      expect(rows).toHaveLength(5);

      const expectedTypes = ['PodScheduled', 'Initialized', 'ContainersReady', 'Ready'];
      expectedTypes.forEach((type, index) => {
        const dataRow = rows[index + 1];
        const cells = within(dataRow).getAllByRole('cell');
        expect(cells[0].textContent).toBe(type);
      });
    });
  });
});
