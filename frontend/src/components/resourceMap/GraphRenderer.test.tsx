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

import { act, render } from '@testing-library/react';
import { GraphRenderer } from './GraphRenderer';

const mocks = vi.hoisted(() => ({
  reactFlowProps: undefined as Record<string, any> | undefined,
}));

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  ConnectionMode: { Loose: 'loose' },
  Controls: ({ children }: { children: React.ReactNode }) => children,
  ReactFlow: (props: Record<string, any>) => {
    mocks.reactFlowProps = props;
    return <div>{props.children}</div>;
  },
}));

vi.mock('./GraphControls', () => ({
  GraphControls: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./edges/GraphEdgeComponent', () => ({
  GraphEdgeComponent: () => null,
}));

vi.mock('./nodes/KubeObjectNode', () => ({
  KubeObjectNodeComponent: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GraphRenderer', () => {
  beforeEach(() => {
    mocks.reactFlowProps = undefined;
  });

  it('forwards continuous viewport movement through onMove', () => {
    const onMove = vi.fn();
    render(<GraphRenderer nodes={[]} edges={[]} onMove={onMove} />);

    expect(mocks.reactFlowProps?.onMove).toBe(onMove);
    expect(mocks.reactFlowProps?.onMoveStart).toBeUndefined();

    const viewport = { x: 10, y: 20, zoom: 1 };
    act(() => mocks.reactFlowProps?.onMove(null, viewport));
    expect(onMove).toHaveBeenCalledWith(null, viewport);
  });
});
