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
import BackendTLSPolicy from '../../../../lib/k8s/backendTLSPolicy';
import BackendTrafficPolicy from '../../../../lib/k8s/backendTrafficPolicy';
import ConfigMap from '../../../../lib/k8s/configMap';
import CRD from '../../../../lib/k8s/crd';
import CronJob from '../../../../lib/k8s/cronJob';
import DaemonSet from '../../../../lib/k8s/daemonSet';
import Deployment from '../../../../lib/k8s/deployment';
import Endpoints from '../../../../lib/k8s/endpoints';
import Gateway from '../../../../lib/k8s/gateway';
import GatewayClass from '../../../../lib/k8s/gatewayClass';
import GRPCRoute from '../../../../lib/k8s/grpcRoute';
import HPA from '../../../../lib/k8s/hpa';
import HTTPRoute from '../../../../lib/k8s/httpRoute';
import Ingress from '../../../../lib/k8s/ingress';
import IngressClass from '../../../../lib/k8s/ingressClass';
import Job from '../../../../lib/k8s/job';
import { KubeObjectClass } from '../../../../lib/k8s/KubeObject';
import MutatingWebhookConfiguration from '../../../../lib/k8s/mutatingWebhookConfiguration';
import NetworkPolicy from '../../../../lib/k8s/networkpolicy';
import PersistentVolumeClaim from '../../../../lib/k8s/persistentVolumeClaim';
import Pod from '../../../../lib/k8s/pod';
import ReferenceGrant from '../../../../lib/k8s/referenceGrant';
import ReplicaSet from '../../../../lib/k8s/replicaSet';
import Role from '../../../../lib/k8s/role';
import RoleBinding from '../../../../lib/k8s/roleBinding';
import Secret from '../../../../lib/k8s/secret';
import Service from '../../../../lib/k8s/service';
import ServiceAccount from '../../../../lib/k8s/serviceAccount';
import StatefulSet from '../../../../lib/k8s/statefulSet';
import ValidatingWebhookConfiguration from '../../../../lib/k8s/validatingWebhookConfiguration';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphSource } from '../../graph/graphModel';
import { getKindGroupColor, KubeIcon } from '../../kubeIcon/KubeIcon';
import { makeKubeObjectNode } from '../GraphSources';

/**
 * Create a GraphSource from KubeObject class definition
 */
const makeKubeSource = (cl: KubeObjectClass): GraphSource => ({
  id: cl.kind,
  label: cl.apiName,
  icon: <KubeIcon kind={cl.kind as any} />,
  useData() {
    const [items] = cl.useList({ namespace: useNamespaces() });

    return useMemo(() => (items ? { nodes: items?.map(makeKubeObjectNode) } : null), [items]);
  },
});

const generateCRSources = (crds: CRD[]): GraphSource[] => {
  const groupedSources = new Map<string, GraphSource[]>();

  for (const crd of crds) {
    const [group] = crd.getMainAPIGroup();
    const source = makeKubeSource(crd.makeCRClass());

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
      ],
    },
    {
      id: 'storage',
      label: 'Storage',
      icon: (
        <Icon icon="mdi:database" width="100%" height="100%" color={getKindGroupColor('storage')} />
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
      sources: [makeKubeSource(ServiceAccount), makeKubeSource(Role), makeKubeSource(RoleBinding)],
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
        // TODO: Implement the rest of resources
        // vpa
        // pdb
        // rq
        // lr
        // priorityClass
        // runtimeClass
        // leases
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
      sources: generateCRSources(CustomResourceDefinition),
    });
  }

  return sources;
}
