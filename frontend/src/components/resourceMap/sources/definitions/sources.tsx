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

import { Icon } from '@iconify/react';
import React, { useMemo } from 'react';
import { useCluster } from '../../../../lib/k8s';
import BackendTLSPolicy from '../../../../lib/k8s/backendTLSPolicy';
import BackendTrafficPolicy from '../../../../lib/k8s/backendTrafficPolicy';
import ConfigMap from '../../../../lib/k8s/configMap';
import CRD from '../../../../lib/k8s/crd';
import CronJob from '../../../../lib/k8s/cronJob';
import DaemonSet from '../../../../lib/k8s/daemonSet';
import Deployment from '../../../../lib/k8s/deployment';
import Endpoints from '../../../../lib/k8s/endpoints';
import EndpointSlice from '../../../../lib/k8s/endpointSlices';
import Gateway from '../../../../lib/k8s/gateway';
import GatewayClass from '../../../../lib/k8s/gatewayClass';
import GRPCRoute from '../../../../lib/k8s/grpcRoute';
import HPA from '../../../../lib/k8s/hpa';
import HTTPRoute from '../../../../lib/k8s/httpRoute';
import Ingress from '../../../../lib/k8s/ingress';
import IngressClass from '../../../../lib/k8s/ingressClass';
import Job from '../../../../lib/k8s/job';
import JobSet from '../../../../lib/k8s/jobSet';
import { KubeObjectClass } from '../../../../lib/k8s/KubeObject';
import { Lease } from '../../../../lib/k8s/lease';
import { LimitRange } from '../../../../lib/k8s/limitRange';
import MutatingWebhookConfiguration from '../../../../lib/k8s/mutatingWebhookConfiguration';
import NetworkPolicy from '../../../../lib/k8s/networkpolicy';
import PersistentVolumeClaim from '../../../../lib/k8s/persistentVolumeClaim';
import Pod from '../../../../lib/k8s/pod';
import PDB from '../../../../lib/k8s/podDisruptionBudget';
import PriorityClass from '../../../../lib/k8s/priorityClass';
import ReferenceGrant from '../../../../lib/k8s/referenceGrant';
import ReplicaSet from '../../../../lib/k8s/replicaSet';
import ResourceQuota from '../../../../lib/k8s/resourceQuota';
import Role from '../../../../lib/k8s/role';
import RoleBinding from '../../../../lib/k8s/roleBinding';
import { RuntimeClass } from '../../../../lib/k8s/runtime';
import Secret from '../../../../lib/k8s/secret';
import Service from '../../../../lib/k8s/service';
import ServiceAccount from '../../../../lib/k8s/serviceAccount';
import StatefulSet from '../../../../lib/k8s/statefulSet';
import ValidatingWebhookConfiguration from '../../../../lib/k8s/validatingWebhookConfiguration';
import VPA from '../../../../lib/k8s/vpa';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphSource } from '../../graph/graphModel';
import { getKindGroupColor, KubeIcon } from '../../kubeIcon/KubeIcon';
import { makeKubeObjectNode } from '../GraphSources';
import { makeKubeSourceId } from './graphDefinitionUtils';

/**
 * List of kinds that are already handled by built-in sources, to avoid duplicates
 * in the Custom Resources section.
 */
const BUILTIN_CRD_KINDS = [
  'VerticalPodAutoscaler',
  'Gateway',
  'GatewayClass',
  'HTTPRoute',
  'GRPCRoute',
  'ReferenceGrant',
  'BackendTLSPolicy',
  'BackendTrafficPolicy',
  'XBackendTrafficPolicy',
];

/**
 * Create a GraphSource from KubeObject class definition
 */
const makeKubeSource = (cl: KubeObjectClass): GraphSource => ({
  id: makeKubeSourceId(cl),
  label: cl.apiName,
  icon: <KubeIcon kind={cl.kind as any} />,
  useData() {
    const [items] = cl.useList({ namespace: useNamespaces() });

    return useMemo(() => (items ? { nodes: items?.map(makeKubeObjectNode) } : null), [items]);
  },
});

const generateCRSources = (crds: CRD[], vpaEnabled: boolean): GraphSource[] => {
  const groupedSources = new Map<string, GraphSource[]>();

  for (const crd of crds) {
    const kind = crd.spec.names.kind;
    if (BUILTIN_CRD_KINDS.includes(kind) && (kind !== 'VerticalPodAutoscaler' || vpaEnabled)) {
      continue;
    }

    const [group] = crd.getMainAPIGroup();
    const source = makeKubeSource(crd.makeCRClass());
    // Add crd prefix to avoid id clashes with resources already defined in other places
    source.id = 'crd-' + source.id;

    if (!groupedSources.has(group)) {
      groupedSources.set(group, []);
    }

    groupedSources.get(group)?.push(source);
  }

  const finalSources: GraphSource[] = [];
  groupedSources.forEach((sources, group) => {
    finalSources.push({
      id: 'crd-' + group,
      label: group,
      icon: <Icon icon="mdi:group" width="100%" height="100%" color={getKindGroupColor('other')} />,
      sources: sources,
    });
  });

  return finalSources;
};

export function useGetAllSources(): GraphSource[] {
  const { items: CustomResourceDefinition } = CRD.useList({ namespace: useNamespaces() });
  const cluster = useCluster();
  const [vpaEnabled, setVpaEnabled] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setVpaEnabled(false);
    VPA.isEnabled().then(enabled => {
      if (!cancelled) {
        setVpaEnabled(enabled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cluster]);

  return useMemo(() => {
    const sources = [
      {
        id: 'workloads',
        label: 'Workloads',
        icon: (
          <Icon
            icon="mdi:circle-slice-2"
            width="100%"
            height="100%"
            color={getKindGroupColor('workloads')}
          />
        ),
        sources: [
          makeKubeSource(Pod),
          makeKubeSource(Deployment),
          makeKubeSource(StatefulSet),
          makeKubeSource(DaemonSet),
          makeKubeSource(ReplicaSet),
          makeKubeSource(Job),
          makeKubeSource(CronJob),
          makeKubeSource(JobSet),
        ],
      },
      {
        id: 'storage',
        label: 'Storage',
        icon: (
          <Icon
            icon="mdi:database"
            width="100%"
            height="100%"
            color={getKindGroupColor('storage')}
          />
        ),
        sources: [makeKubeSource(PersistentVolumeClaim)],
      },
      {
        id: 'network',
        label: 'Network',
        icon: (
          <Icon
            icon="mdi:folder-network-outline"
            width="100%"
            height="100%"
            color={getKindGroupColor('network')}
          />
        ),
        sources: [
          makeKubeSource(Service),
          makeKubeSource(Endpoints),
          makeKubeSource(EndpointSlice),
          makeKubeSource(Ingress),
          makeKubeSource(IngressClass),
          makeKubeSource(NetworkPolicy),
        ],
      },
      {
        id: 'security',
        label: 'Security',
        isEnabledByDefault: false,
        icon: (
          <Icon icon="mdi:lock" width="100%" height="100%" color={getKindGroupColor('security')} />
        ),
        sources: [
          makeKubeSource(ServiceAccount),
          makeKubeSource(Role),
          makeKubeSource(RoleBinding),
        ],
      },
      {
        id: 'configuration',
        label: 'Configuration',
        icon: (
          <Icon
            icon="mdi:format-list-checks"
            width="100%"
            height="100%"
            color={getKindGroupColor('configuration')}
          />
        ),
        isEnabledByDefault: false,
        sources: [
          makeKubeSource(ConfigMap),
          makeKubeSource(Secret),
          makeKubeSource(MutatingWebhookConfiguration),
          makeKubeSource(ValidatingWebhookConfiguration),
          makeKubeSource(HPA),
          ...(vpaEnabled ? [makeKubeSource(VPA)] : []),
          makeKubeSource(PDB),
          makeKubeSource(ResourceQuota),
          makeKubeSource(LimitRange),
          makeKubeSource(PriorityClass),
          makeKubeSource(RuntimeClass),
          makeKubeSource(Lease),
        ],
      },
      {
        id: 'gateway-beta',
        label: 'Gateway (beta)',
        icon: (
          <Icon
            icon="mdi:lan-connect"
            width="100%"
            height="100%"
            color={getKindGroupColor('network')}
          />
        ),
        isEnabledByDefault: false,
        sources: [
          makeKubeSource(GatewayClass),
          makeKubeSource(Gateway),
          makeKubeSource(HTTPRoute),
          makeKubeSource(GRPCRoute),
          makeKubeSource(ReferenceGrant),
          makeKubeSource(BackendTLSPolicy),
          makeKubeSource(BackendTrafficPolicy),
        ],
      },
    ];

    if (CustomResourceDefinition !== null) {
      sources.push({
        id: 'customresource',
        label: 'Custom Resources',
        icon: (
          <Icon
            icon="mdi:select-group"
            width="100%"
            height="100%"
            color={getKindGroupColor('configuration')}
          />
        ),
        isEnabledByDefault: false,
        sources: generateCRSources(CustomResourceDefinition, vpaEnabled),
      });
    }

    return sources;
  }, [CustomResourceDefinition, vpaEnabled]);
}
