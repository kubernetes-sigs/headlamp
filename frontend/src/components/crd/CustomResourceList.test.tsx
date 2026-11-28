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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomResourceDefinition from '../../lib/k8s/crd';
import { TestContext } from '../../test';
import { CustomResourceListTable } from './CustomResourceList';
import { mockCRD } from './storyHelper';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('../common/Link', () => ({
  default: () => null,
}));

vi.mock('../../redux/hooks', () => ({
  useSelectedClusters: () => ['main'],
}));

function renderTable(columns: any[]) {
  const crd = new CustomResourceDefinition({
    ...mockCRD,
    spec: {
      ...mockCRD.spec,
      versions: [
        {
          name: 'v1',
          served: true,
          storage: true,
          additionalPrinterColumns: columns,
        },
      ],
    },
  } as any);

  render(
    <TestContext>
      <CustomResourceListTable crd={crd} />
    </TestContext>
  );

  return mockResourceListView.mock.calls[0][0].columns;
}

describe('CustomResourceListTable additionalPrinterColumns priority', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('shows priority 0 and unset-priority columns and hides priority > 0 and creationTimestamp', () => {
    const columns = renderTable([
      { name: 'DefaultCol', type: 'string', jsonPath: '.spec.defaultCol' },
      { name: 'ZeroPriorityCol', type: 'string', jsonPath: '.spec.zeroCol', priority: 0 },
      { name: 'WideOnlyCol', type: 'string', jsonPath: '.spec.wideCol', priority: 1 },
      { name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp', priority: 0 },
    ]);

    const labels = columns.map((col: any) => (typeof col === 'string' ? col : col.label));
    expect(labels).toContain('DefaultCol');
    expect(labels).toContain('ZeroPriorityCol');
    expect(labels).not.toContain('WideOnlyCol');
    expect(labels).not.toContain('Age');
  });

  it('sorts a date column by time, not by its locale date text', () => {
    const columns = renderTable([
      { name: 'Finished', type: 'date', jsonPath: '.status.completionTime' },
    ]);
    const finished = columns.find((col: any) => col.label === 'Finished');
    // In en-US these read "12/31/2025, …" and "1/2/2026, …", and "1/2" sorts first as text.
    const older = { jsonData: { status: { completionTime: '2025-12-31T09:00:00Z' } } };
    const newer = { jsonData: { status: { completionTime: '2026-01-02T09:00:00Z' } } };

    expect(typeof finished.sort).toBe('function');
    expect(finished.sort(older, newer)).toBeLessThan(0);
    expect(finished.sort(newer, older)).toBeGreaterThan(0);
  });
});
