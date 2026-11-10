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
import { DeploymentGlance } from './DeploymentGlance';
import { HorizontalPodAutoscalerGlance } from './HorizontalPodAutoscalerGlance';
import { PodGlance } from './PodGlance';
import { ReplicaSetGlance } from './ReplicaSetGlance';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').at(-1) }),
}));
vi.mock('../../common/Label', () => ({
  StatusLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../../pod/List', () => ({
  makePodStatusLabel: (pod: any, detailed: boolean) =>
    `status:${pod.status?.phase ?? 'Unknown'}:${detailed}`,
}));

describe('DeploymentGlance', () => {
  it('renders replica availability and each condition', () => {
    render(
      <DeploymentGlance
        deployment={
          {
            status: {
              replicas: 4,
              availableReplicas: 3,
              conditions: [{ type: 'Available' }, { type: 'Progressing' }],
            },
          } as any
        }
      />
    );

    expect(screen.getByText('Pods: 3/4')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Progressing')).toBeInTheDocument();
  });

  it('falls back to zero for missing replica counts', () => {
    render(<DeploymentGlance deployment={{ status: { conditions: [] } } as any} />);

    expect(screen.getByText('Pods: 0/0')).toBeInTheDocument();
  });
});

describe('PodGlance', () => {
  it('renders status, every container, and the pod IP', () => {
    render(
      <PodGlance
        pod={
          {
            spec: { containers: [{ name: 'app' }, { name: 'sidecar' }] },
            status: { phase: 'Running', podIP: '10.0.0.12' },
          } as any
        }
      />
    );

    expect(screen.getByText('status:Running:true')).toBeInTheDocument();
    expect(screen.getByText('Container: app')).toBeInTheDocument();
    expect(screen.getByText('Container: sidecar')).toBeInTheDocument();
    expect(screen.getByText('IP: 10.0.0.12')).toBeInTheDocument();
  });

  it('omits an IP when pod status is missing', () => {
    render(<PodGlance pod={{ spec: { containers: [] } } as any} />);

    expect(screen.getByText('status:Unknown:true')).toBeInTheDocument();
    expect(screen.queryByText(/^IP:/)).not.toBeInTheDocument();
  });
});

describe('ReplicaSetGlance', () => {
  it('renders ready and desired replicas', () => {
    render(
      <ReplicaSetGlance set={{ status: { readyReplicas: 2 }, spec: { replicas: 5 } } as any} />
    );

    expect(screen.getByText('Replicas: 2/5')).toBeInTheDocument();
  });

  it('falls back to zero when status and spec are missing', () => {
    render(<ReplicaSetGlance set={{} as any} />);

    expect(screen.getByText('Replicas: 0/0')).toBeInTheDocument();
  });
});

describe('HorizontalPodAutoscalerGlance', () => {
  it('renders replica bounds and repeated condition types', () => {
    render(
      <HorizontalPodAutoscalerGlance
        hpa={
          {
            status: {
              currentReplicas: 2,
              desiredReplicas: 4,
              conditions: [{ type: 'AbleToScale' }, { type: 'AbleToScale' }],
            },
            spec: { minReplicas: 1, maxReplicas: 8 },
          } as any
        }
      />
    );

    expect(screen.getByText('Current: 2')).toBeInTheDocument();
    expect(screen.getByText('Desired: 4')).toBeInTheDocument();
    expect(screen.getByText('Min/Max: 1/8')).toBeInTheDocument();
    expect(screen.getAllByText('AbleToScale')).toHaveLength(2);
  });

  it('falls back to zero and omits conditions when data is missing', () => {
    render(<HorizontalPodAutoscalerGlance hpa={{} as any} />);

    expect(screen.getByText('Current: 0')).toBeInTheDocument();
    expect(screen.getByText('Desired: 0')).toBeInTheDocument();
    expect(screen.getByText('Min/Max: 0/0')).toBeInTheDocument();
  });
});
