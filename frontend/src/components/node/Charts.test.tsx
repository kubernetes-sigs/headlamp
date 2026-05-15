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
import { describe, expect, it, vi } from 'vitest';
import { parseDiskSpace } from '../../lib/units';
import { TestContext } from '../../test';
import { StorageBarChart } from './Charts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.replace(/^.*\|/, ''),
    i18n: { language: 'en' },
  }),
}));

const capturedProps: any[] = [];
vi.mock('../common/Chart', () => ({
  PercentageBar: (props: any) => {
    capturedProps.push(props);
    return <div data-testid="percentage-bar" />;
  },
}));

function makeNode(capacity: string, allocatable: string): any {
  return {
    status: {
      capacity: { 'ephemeral-storage': capacity },
      allocatable: { 'ephemeral-storage': allocatable },
    },
  };
}

describe('StorageBarChart', () => {
  it('passes correct allocatable value and capacity total to PercentageBar', () => {
    capturedProps.length = 0;
    const node = makeNode('100Gi', '90Gi');
    render(
      <TestContext>
        <StorageBarChart node={node} />
      </TestContext>
    );
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0].data[0].value).toBe(parseDiskSpace('90Gi'));
    expect(capturedProps[0].total).toBe(parseDiskSpace('100Gi'));
  });

  it('skips rendering PercentageBar when capacity is zero', () => {
    capturedProps.length = 0;
    const node = makeNode('0', '0');
    render(
      <TestContext>
        <StorageBarChart node={node} />
      </TestContext>
    );
    expect(capturedProps).toHaveLength(0);
  });

  it('falls back to camelCase ephemeralStorage key', () => {
    capturedProps.length = 0;
    const node = {
      status: {
        capacity: { ephemeralStorage: '50Gi' },
        allocatable: { ephemeralStorage: '45Gi' },
      },
    } as any;
    render(
      <TestContext>
        <StorageBarChart node={node} />
      </TestContext>
    );
    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0].data[0].value).toBe(parseDiskSpace('45Gi'));
    expect(capturedProps[0].total).toBe(parseDiskSpace('50Gi'));
  });

  it('tooltip shows allocatable, capacity and percentage', () => {
    capturedProps.length = 0;
    const node = makeNode('100Gi', '90Gi');
    render(
      <TestContext>
        <StorageBarChart node={node} />
      </TestContext>
    );
    expect(capturedProps).toHaveLength(1);
    const tooltip = render(<TestContext>{capturedProps[0].tooltipFunc()}</TestContext>);
    const text = tooltip.container.textContent ?? '';
    expect(text).toContain('Allocatable');
    expect(text).toContain('Capacity');
    expect(text).toContain('%');
  });
});
