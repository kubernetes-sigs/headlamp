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
import { canRenderDetails, KubeObjectDetails } from './KubeNodeDetails';

const makeDetails = vi.hoisted(
  () =>
    (label: string) =>
    ({ name, namespace, cluster }: { name?: string; namespace?: string; cluster?: string }) =>
      `${label}:${name ?? ''}:${namespace ?? ''}:${cluster ?? ''}`
);

vi.mock('../../../lib/k8s/deployment', () => ({ default: class Deployment {} }));
vi.mock('../../../lib/k8s/jobSet', () => ({ default: class JobSet {} }));
vi.mock('../../../lib/k8s/replicaSet', () => ({ default: class ReplicaSet {} }));
vi.mock('../../configmap/Details', () => ({ default: makeDetails('ConfigMap') }));
vi.mock('../../crd/CustomResourceDetails', () => ({
  CustomResourceDetails: ({ crName, crd, namespace, cluster }: any) =>
    `CustomResource:${crName}:${crd}:${namespace ?? ''}:${cluster ?? ''}`,
}));
vi.mock('../../crd/Details', () => ({ default: makeDetails('CustomResourceDefinition') }));
vi.mock('../../cronjob/Details', () => ({ default: makeDetails('CronJob') }));
vi.mock('../../daemonset/Details', () => ({ default: makeDetails('DaemonSet') }));
vi.mock('../../endpoints/Details', () => ({ default: makeDetails('Endpoints') }));
vi.mock('../../endpointSlices/Details', () => ({ default: makeDetails('EndpointSlice') }));
vi.mock('../../gateway/BackendTLSPolicyDetails', () => ({
  default: makeDetails('BackendTLSPolicy'),
}));
vi.mock('../../gateway/ClassDetails', () => ({ default: makeDetails('GatewayClass') }));
vi.mock('../../gateway/GatewayDetails', () => ({ default: makeDetails('Gateway') }));
vi.mock('../../gateway/GRPCRouteDetails', () => ({ default: makeDetails('GRPCRoute') }));
vi.mock('../../gateway/HTTPRouteDetails', () => ({ default: makeDetails('HTTPRoute') }));
vi.mock('../../gateway/ReferenceGrantDetails', () => ({
  default: makeDetails('ReferenceGrant'),
}));
vi.mock('../../horizontalPodAutoscaler/Details', () => ({
  default: makeDetails('HorizontalPodAutoscaler'),
}));
vi.mock('../../ingress/ClassDetails', () => ({ default: makeDetails('IngressClass') }));
vi.mock('../../ingress/Details', () => ({ default: makeDetails('Ingress') }));
vi.mock('../../job/Details', () => ({ default: makeDetails('Job') }));
vi.mock('../../lease/Details', () => ({ LeaseDetails: makeDetails('Lease') }));
vi.mock('../../limitRange/Details', () => ({ LimitRangeDetails: makeDetails('LimitRange') }));
vi.mock('../../namespace/Details', () => ({ default: makeDetails('Namespace') }));
vi.mock('../../networkpolicy/Details', () => ({
  NetworkPolicyDetails: makeDetails('NetworkPolicy'),
}));
vi.mock('../../node/Details', () => ({ default: makeDetails('Node') }));
vi.mock('../../pod/Details', () => ({ default: makeDetails('Pod') }));
vi.mock('../../podDisruptionBudget/Details', () => ({
  default: makeDetails('PodDisruptionBudget'),
}));
vi.mock('../../priorityClass/Details', () => ({ default: makeDetails('PriorityClass') }));
vi.mock('../../resourceQuota/Details', () => ({ default: makeDetails('ResourceQuota') }));
vi.mock('../../role/BindingDetails', () => ({ default: makeDetails('RoleBinding') }));
vi.mock('../../role/Details', () => ({ default: makeDetails('Role') }));
vi.mock('../../runtimeClass/Details', () => ({
  RuntimeClassDetails: makeDetails('RuntimeClass'),
}));
vi.mock('../../secret/Details', () => ({ default: makeDetails('Secret') }));
vi.mock('../../service/Details', () => ({ default: makeDetails('Service') }));
vi.mock('../../serviceaccount/Details', () => ({ default: makeDetails('ServiceAccount') }));
vi.mock('../../statefulset/Details', () => ({ default: makeDetails('StatefulSet') }));
vi.mock('../../storage/ClaimDetails', () => ({ default: makeDetails('PersistentVolumeClaim') }));
vi.mock('../../storage/ClassDetails', () => ({ default: makeDetails('StorageClass') }));
vi.mock('../../storage/VolumeAttributesClassDetails', () => ({
  default: makeDetails('VolumeAttributesClass'),
}));
vi.mock('../../storage/VolumeDetails', () => ({ default: makeDetails('PersistentVolume') }));
vi.mock('../../verticalPodAutoscaler/Details', () => ({
  default: makeDetails('VerticalPodAutoscaler'),
}));
vi.mock('../../webhookconfiguration/MutatingWebhookConfigDetails', () => ({
  default: makeDetails('MutatingWebhookConfiguration'),
}));
vi.mock('../../webhookconfiguration/ValidatingWebhookConfigDetails', () => ({
  default: makeDetails('ValidatingWebhookConfiguration'),
}));
vi.mock('../../workload/Details', () => ({ default: makeDetails('Workload') }));

const dispatchCases = [
  ['Pod', 'Pod'],
  ['Deployment', 'Workload'],
  ['ReplicaSet', 'Workload'],
  ['Job', 'Job'],
  ['JobSet', 'Workload'],
  ['Service', 'Service'],
  ['CronJob', 'CronJob'],
  ['DaemonSet', 'DaemonSet'],
  ['ConfigMap', 'ConfigMap'],
  ['Endpoints', 'Endpoints'],
  ['EndpointSlice', 'EndpointSlice'],
  ['HorizontalPodAutoscaler', 'HorizontalPodAutoscaler'],
  ['Ingress', 'Ingress'],
  ['Lease', 'Lease'],
  ['LimitRange', 'LimitRange'],
  ['Namespace', 'Namespace'],
  ['NetworkPolicy', 'NetworkPolicy'],
  ['Node', 'Node'],
  ['PodDisruptionBudget', 'PodDisruptionBudget'],
  ['PriorityClass', 'PriorityClass'],
  ['ResourceQuota', 'ResourceQuota'],
  ['ClusterRole', 'Role'],
  ['Role', 'Role'],
  ['RoleBinding', 'RoleBinding'],
  ['RuntimeClass', 'RuntimeClass'],
  ['Secret', 'Secret'],
  ['ServiceAccount', 'ServiceAccount'],
  ['StatefulSet', 'StatefulSet'],
  ['PersistentVolumeClaim', 'PersistentVolumeClaim'],
  ['StorageClass', 'StorageClass'],
  ['VolumeAttributesClass', 'VolumeAttributesClass'],
  ['PersistentVolume', 'PersistentVolume'],
  ['VerticalPodAutoscaler', 'VerticalPodAutoscaler'],
  ['MutatingWebhookConfiguration', 'MutatingWebhookConfiguration'],
  ['ValidatingWebhookConfiguration', 'ValidatingWebhookConfiguration'],
  ['IngressClass', 'IngressClass'],
  ['CustomResourceDefinition', 'CustomResourceDefinition'],
  ['crd', 'CustomResourceDefinition'],
  ['Gateway', 'Gateway'],
  ['GatewayClass', 'GatewayClass'],
  ['HTTPRoute', 'HTTPRoute'],
  ['GRPCRoute', 'GRPCRoute'],
  ['ReferenceGrant', 'ReferenceGrant'],
  ['BackendTLSPolicy', 'BackendTLSPolicy'],
  ['XBackendTrafficPolicy', 'BackendTLSPolicy'],
] as const;

describe('canRenderDetails', () => {
  it.each(dispatchCases)('supports %s', kind => {
    expect(canRenderDetails(kind)).toBe(true);
  });

  it('supports custom resources and rejects missing or unsupported kinds', () => {
    expect(canRenderDetails('customresource')).toBe(true);
    expect(canRenderDetails('pOd')).toBe(true);
    expect(canRenderDetails('Unknown')).toBe(false);
    expect(canRenderDetails(undefined as any)).toBe(false);
  });
});

describe('KubeObjectDetails', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it.each(dispatchCases)('dispatches %s to its details component', (kind, label) => {
    render(
      <KubeObjectDetails
        resource={{
          kind,
          cluster: 'cluster-a',
          metadata: { name: 'resource-a', namespace: 'default' },
        }}
      />
    );

    expect(screen.getByText(`${label}:resource-a:default:cluster-a`)).toBeInTheDocument();
  });

  it('matches details components case-insensitively', () => {
    render(<KubeObjectDetails resource={{ kind: 'pOd', metadata: { name: 'pod-a' } }} />);

    expect(screen.getByText('Pod:pod-a::')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'No details component for kind pOd was found. See KubeNodeDetails.tsx for more info'
    );
  });

  it('uses custom resource details when a CRD is supplied', () => {
    render(
      <KubeObjectDetails
        resource={{
          kind: 'Widget',
          cluster: 'cluster-a',
          metadata: { name: 'widget-a', namespace: 'widgets' },
        }}
        customResourceDefinition="widgets.example.io"
      />
    );

    expect(
      screen.getByText('CustomResource:widget-a:widgets.example.io:widgets:cluster-a')
    ).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'No details component for kind Widget was found. See KubeNodeDetails.tsx for more info'
    );
  });

  it('passes a missing namespace through to custom resource details', () => {
    render(
      <KubeObjectDetails
        resource={{ kind: 'Widget', metadata: { name: 'cluster-widget' } }}
        customResourceDefinition="widgets.example.io"
      />
    );

    expect(
      screen.getByText('CustomResource:cluster-widget:widgets.example.io::')
    ).toBeInTheDocument();
  });

  it('renders no content and reports an unsupported kind', () => {
    const { container } = render(
      <KubeObjectDetails resource={{ kind: 'Unknown', metadata: { name: 'unknown-a' } }} />
    );

    expect(container).toHaveTextContent('');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'No details component for kind Unknown was found. See KubeNodeDetails.tsx for more info'
    );
  });
});
