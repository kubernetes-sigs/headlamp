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

import { render, screen, waitFor } from '@testing-library/react';
import { KubeObjectGlance } from './KubeObjectGlance';

const mocks = vi.hoisted(() => ({
  objectEvents: vi.fn(),
  isClassOf: (kind: string) => vi.fn((resource: any) => resource.matches?.includes(kind)),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').at(-1) }),
}));
vi.mock('@iconify/react', () => ({ Icon: ({ icon }: { icon: string }) => <span>{icon}</span> }));
vi.mock('../../../lib/k8s/deployment', () => ({
  default: { isClassOf: mocks.isClassOf('Deployment') },
}));
vi.mock('../../../lib/k8s/endpoints', () => ({
  default: { isClassOf: mocks.isClassOf('Endpoints') },
}));
vi.mock('../../../lib/k8s/hpa', () => ({
  default: { isClassOf: mocks.isClassOf('HorizontalPodAutoscaler') },
}));
vi.mock('../../../lib/k8s/pod', () => ({ default: { isClassOf: mocks.isClassOf('Pod') } }));
vi.mock('../../../lib/k8s/replicaSet', () => ({
  default: { isClassOf: mocks.isClassOf('ReplicaSet') },
}));
vi.mock('../../../lib/k8s/service', () => ({
  default: { isClassOf: mocks.isClassOf('Service') },
}));
vi.mock('../../../lib/k8s/statefulSet', () => ({
  default: { isClassOf: mocks.isClassOf('StatefulSet') },
}));
vi.mock('../../../lib/k8s/event', () => ({
  default: class MockEvent {
    static objectEvents = mocks.objectEvents;
    message: string;
    lastOccurrence: string;

    constructor(data: any) {
      this.message = data.message;
      this.lastOccurrence = data.lastOccurrence;
    }
  },
}));
vi.mock('../../common/Label', () => ({
  DateLabel: ({ date, format }: { date: string; format: string }) => `${date}:${format}`,
}));
vi.mock('../../common/Tooltip', () => ({
  LightTooltip: ({ title, children }: any) => <span aria-label={title}>{children}</span>,
}));
vi.mock('./DeploymentGlance', () => ({
  DeploymentGlance: () => <div>deployment-glance</div>,
}));
vi.mock('./EndpointsGlance', () => ({ EndpointsGlance: () => <div>endpoints-glance</div> }));
vi.mock('./HorizontalPodAutoscalerGlance', () => ({
  HorizontalPodAutoscalerGlance: () => <div>hpa-glance</div>,
}));
vi.mock('./PodGlance', () => ({ PodGlance: () => <div>pod-glance</div> }));
vi.mock('./ReplicaSetGlance', () => ({ ReplicaSetGlance: () => <div>set-glance</div> }));
vi.mock('./ServiceGlance', () => ({ ServiceGlance: () => <div>service-glance</div> }));

describe('KubeObjectGlance', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.objectEvents.mockReset();
    mocks.objectEvents.mockReturnValue(new Promise(() => {}));
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it.each([
    ['Pod', 'pod-glance'],
    ['Deployment', 'deployment-glance'],
    ['Service', 'service-glance'],
    ['Endpoints', 'endpoints-glance'],
    ['ReplicaSet', 'set-glance'],
    ['StatefulSet', 'set-glance'],
    ['HorizontalPodAutoscaler', 'hpa-glance'],
  ])('dispatches %s resources', (kind, expected) => {
    render(<KubeObjectGlance resource={{ matches: [kind] } as any} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('can render every independently matching glance section', () => {
    render(
      <KubeObjectGlance
        resource={
          {
            matches: [
              'Pod',
              'Deployment',
              'Service',
              'Endpoints',
              'ReplicaSet',
              'StatefulSet',
              'HorizontalPodAutoscaler',
            ],
          } as any
        }
      />
    );

    expect(screen.getByText('pod-glance')).toBeInTheDocument();
    expect(screen.getByText('deployment-glance')).toBeInTheDocument();
    expect(screen.getByText('service-glance')).toBeInTheDocument();
    expect(screen.getByText('endpoints-glance')).toBeInTheDocument();
    expect(screen.getByText('hpa-glance')).toBeInTheDocument();
    expect(screen.getAllByText('set-glance')).toHaveLength(1);
  });

  it('loads events once, converts them, and displays only the first five', async () => {
    const resource = { matches: [] } as any;
    mocks.objectEvents.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        message: `event-${index + 1}`,
        lastOccurrence: `time-${index + 1}`,
      }))
    );

    const { rerender } = render(<KubeObjectGlance resource={resource} />);

    expect(await screen.findByText('Events')).toBeInTheDocument();
    expect(screen.getByLabelText('event-1')).toBeInTheDocument();
    expect(screen.getByText('time-5:mini')).toBeInTheDocument();
    expect(screen.queryByText('event-6')).not.toBeInTheDocument();
    expect(screen.queryByText('time-6:mini')).not.toBeInTheDocument();
    expect(mocks.objectEvents).toHaveBeenCalledWith(resource);

    rerender(<KubeObjectGlance resource={{ matches: ['Pod'] } as any} />);
    expect(mocks.objectEvents).toHaveBeenCalledTimes(1);
  });

  it('renders no sections when the resource is unsupported and has no events', async () => {
    mocks.objectEvents.mockResolvedValue([]);
    const { container } = render(<KubeObjectGlance resource={{ matches: [] } as any} />);

    await waitFor(() => expect(mocks.objectEvents).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
