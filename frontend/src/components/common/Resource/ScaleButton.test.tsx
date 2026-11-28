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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clusterAction } from '../../../redux/clusterActionSlice';
import { TestContext } from '../../../test';
import ScaleButton from './ScaleButton';

vi.mock('./AuthVisible', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ActionButton', () => ({
  default: ({ description, onClick }: { description: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {description}
    </button>
  ),
}));

vi.mock('../../../redux/clusterActionSlice', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../redux/clusterActionSlice')>();
  return {
    ...actual,
    clusterAction: vi.fn((cb: () => unknown) => {
      cb();
      return { type: 'clusterAction' };
    }),
  };
});

vi.mock('../../../redux/headlampEventSlice', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../redux/headlampEventSlice')>();
  return {
    ...actual,
    useEventCallback: () => vi.fn(),
  };
});

function makeScalableItem(spec: Record<string, any> | undefined, isScalable = true) {
  return {
    kind: 'Deployment',
    metadata: { name: 'my-deploy', namespace: 'default', uid: 'deploy-1' },
    spec,
    isScalable,
    scale: vi.fn().mockResolvedValue({}),
  } as any;
}

describe('ScaleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when item is not scalable', () => {
    const item = makeScalableItem({ replicas: 2 }, false);
    const { container } = render(
      <TestContext>
        <ScaleButton item={item} />
      </TestContext>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('opens dialog, increments replicas, and calls item.scale on Apply', () => {
    const item = makeScalableItem({ replicas: 3 });
    render(
      <TestContext>
        <ScaleButton item={item} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scale' }));
    expect(screen.getByText('Current number of replicas: 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(item.scale).toHaveBeenCalledWith(4);
    expect(clusterAction).toHaveBeenCalled();
  });

  it.each([undefined, {}])(
    'handles missing spec or replicas (%o) safely without throwing',
    spec => {
      const item = makeScalableItem(spec);
      render(
        <TestContext>
          <ScaleButton item={item} />
        </TestContext>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Scale' }));
      expect(screen.getByText('Current number of replicas: Unknown')).toBeInTheDocument();
    }
  );
});
