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

import { useMemo } from 'react';
import BackendTLSPolicy from '../../../../lib/k8s/backendTLSPolicy';
import BackendTrafficPolicy from '../../../../lib/k8s/backendTrafficPolicy';
import ConfigMap from '../../../../lib/k8s/configMap';
import CustomResourceDefinition from '../../../../lib/k8s/crd';
import CronJob from '../../../../lib/k8s/cronJob';
import DaemonSet from '../../../../lib/k8s/daemonSet';
import Deployment from '../../../../lib/k8s/deployment';
import Endpoints from '../../../../lib/k8s/endpoints';
import EndpointSlice from '../../../../lib/k8s/endpointSlices';
import Gateway from '../../../../lib/k8s/gateway';
import GatewayClass from '../../../../lib/k8s/gatewayClass';
import HPA from '../../../../lib/k8s/hpa';
import HTTPRoute from '../../../../lib/k8s/httpRoute';
import Ingress from '../../../../lib/k8s/ingress';
import Job from '../../../../lib/k8s/job';
import JobSet from '../../../../lib/k8s/jobSet';
import { KubeObject, KubeObjectClass } from '../../../../lib/k8s/KubeObject';
import MutatingWebhookConfiguration from '../../../../lib/k8s/mutatingWebhookConfiguration';
import NetworkPolicy from '../../../../lib/k8s/networkpolicy';
import PersistentVolumeClaim from '../../../../lib/k8s/persistentVolumeClaim';
import Pod from '../../../../lib/k8s/pod';
import ReplicaSet from '../../../../lib/k8s/replicaSet';
import Role from '../../../../lib/k8s/role';
import RoleBinding from '../../../../lib/k8s/roleBinding';
import Secret from '../../../../lib/k8s/secret';
import Service from '../../../../lib/k8s/service';
import ServiceAccount from '../../../../lib/k8s/serviceAccount';
import StatefulSet from '../../../../lib/k8s/statefulSet';
import ValidatingWebhookConfiguration from '../../../../lib/k8s/validatingWebhookConfiguration';
import { useNamespaces } from '../../../../redux/filterSlice';
import { useTypedSelector } from '../../../../redux/hooks';
import { GraphNode, Relation } from '../../graph/graphModel';
import { makeKubeSourceId } from './graphDefinitionUtils';
import { BUILT_IN_RELATION_IDS } from './relationIds';

/**
 * Check if the given item has matching labels
 */
export const matchesLabels = (matchLabels: Record<string, string>, item: KubeObject) => {
  return (
    matchLabels &&
    item.metadata.labels &&
    Object.entries(matchLabels).every(([key, value]) => item.metadata?.labels?.[key] === value)
  );
};

const makeRelation = <From extends KubeObjectClass, To extends KubeObjectClass>(
  id: string,
  from: From,
  to: To,
  selector: (a: InstanceType<From>, b: InstanceType<To>) => unknown
): Relation => ({
  id,
  fromSource: makeKubeSourceId(from),
  toSource: makeKubeSourceId(to),
  predicate(fromNode, toNode) {
    const fromObject = fromNode.kubeObject as InstanceType<From>;
    const toObject = toNode.kubeObject as InstanceType<To>;

    const hasSameNamespace =
      !fromObject.metadata?.namespace || !toObject.metadata?.namespace
        ? true
        : fromObject.metadata.namespace === toObject.metadata.namespace;

    return (
      fromObject.cluster === toObject.cluster &&
      hasSameNamespace &&
      Boolean(selector(fromObject, toObject))
    );
  },
});

const makeOwnerRelation = (cl: KubeObjectClass): Relation => ({
  id: `owner-${makeKubeSourceId(cl)}`,
  fromSource: makeKubeSourceId(cl),
  predicate(from, to) {
    const obj = from.kubeObject as KubeObject;

    return (
      obj.metadata.ownerReferences?.find(owner => owner.uid === to.kubeObject?.metadata?.uid) !==
      undefined
    );
  },
});

const makeOwnerRelationReversed = (cl: KubeObjectClass): Relation => ({
  id: `owner-reversed-${makeKubeSourceId(cl)}`,
  fromSource: makeKubeSourceId(cl),
  predicate(from, to) {
    const obj = to.kubeObject as KubeObject;

    return (
      obj.metadata.ownerReferences?.find(owner => owner.uid === from.kubeObject?.metadata?.uid) !==
      undefined
    );
  },
});

const configMapUsedInPods = makeRelation('pod-configmap', Pod, ConfigMap, (pod, configMap) =>
  pod.spec.volumes?.find(volume => volume.configMap?.name === configMap.metadata.name)
);

const configMapUsedInJobs = makeRelation('job-configmap', Job, ConfigMap, (job, configMap) =>
  job.spec.template.spec.volumes?.find(
    volume => volume?.configMap?.name === configMap.metadata.name
  )
);

const secretsUsedInPods = makeRelation(
  'pod-secret',
  Pod,
  Secret,
  (pod, secret) =>
    pod.spec.containers?.find(container =>
      container.env?.find(env => secret.metadata.name === env.valueFrom?.secretKeyRef?.name)
    ) ??
    pod.spec.volumes?.find(volume =>
      volume.projected?.sources?.find((source: any) => source.secret?.name === secret.metadata.name)
    )
);

const secretsUsedInJobs = makeRelation('job-secret', Job, Secret, (job, secret) =>
  job.spec.template.spec.containers?.find(container =>
    container.env?.find(env => secret.metadata.name === env.valueFrom?.secretKeyRef?.name)
  )
);

const hpaToDeployment = makeRelation(
  'hpa-deployment',
  HPA,
  Deployment,
  (hpa, deployment) =>
    hpa.spec.scaleTargetRef?.apiVersion === Deployment.apiVersion &&
    hpa.spec.scaleTargetRef?.kind === Deployment.kind &&
    hpa.spec.scaleTargetRef?.name === deployment.metadata.name
);

const hpaToStatefulSet = makeRelation(
  'hpa-statefulset',
  HPA,
  StatefulSet,
  (hpa, statefulSet) =>
    hpa.spec.scaleTargetRef?.apiVersion === StatefulSet.apiVersion &&
    hpa.spec.scaleTargetRef?.kind === StatefulSet.kind &&
    hpa.spec.scaleTargetRef?.name === statefulSet.metadata.name
);

const vwcToService = makeRelation(
  'vwc-service',
  ValidatingWebhookConfiguration,
  Service,
  (vwc, service) =>
    vwc.webhooks.find(webhook => service.metadata.name === webhook.clientConfig.service?.name)
);

const mwcToService = makeRelation(
  'mwc-service',
  MutatingWebhookConfiguration,
  Service,
  (mwc, service) =>
    mwc.webhooks.find(webhook => service.metadata.name === webhook.clientConfig.service?.name)
);

const serviceToPods = makeRelation('service-pod', Service, Pod, (service, pod) =>
  matchesLabels(service.spec.selector, pod)
);

const endpointsToServices = makeRelation(
  'endpoints-service',
  Endpoints,
  Service,
  (endpoint, service) => endpoint.getName() === service.getName()
);

const endpointSlicesToServices = makeRelation(
  'endpointslices-service',
  EndpointSlice,
  Service,
  (endpoint, service) => endpoint.getOwnerServiceName() === service.getName()
);

const ingressToService = makeRelation('ingress-service', Ingress, Service, (ingress, service) =>
  ingress.spec?.rules?.find((rule: any) =>
    rule.http?.paths?.find((path: any) => service.metadata.name === path?.backend?.service?.name)
  )
);

const ingressToSecret = makeRelation('ingress-secret', Ingress, Secret, (ingress, secret) =>
  ingress.spec.tls?.find(tls => tls.secretName === secret.metadata.name)
);

const networkPolicyToPod = makeRelation('networkpolicy-pod', NetworkPolicy, Pod, (np, pod) =>
  matchesLabels(np.spec.podSelector.matchLabels ?? {}, pod)
);

const roleBindingsToRole = makeRelation(
  'rolebinding-role',
  RoleBinding,
  Role,
  (binding, role) => role.metadata.name === binding.roleRef.name
);

const roleBindingToServiceAccount = makeRelation(
  'rolebinding-sa',
  RoleBinding,
  ServiceAccount,
  (binding, sa) =>
    binding.subjects.find(
      subject => subject.kind === 'ServiceAccount' && sa.metadata.name === subject.name
    )
);

const serviceAccountToDeployments = makeRelation(
  'sa-deployment',
  ServiceAccount,
  Deployment,
  (sa, deployment) =>
    (deployment.spec?.template?.spec?.serviceAccountName ?? 'default') === sa.metadata.name &&
    deployment.metadata.namespace === sa.metadata.namespace
);

const serviceAccountToDaemonSets = makeRelation(
  'sa-daemonset',
  ServiceAccount,
  DaemonSet,
  (sa, ds) =>
    (ds.spec?.template?.spec?.serviceAccountName ?? 'default') === sa.metadata.name &&
    ds.metadata.namespace === sa.metadata.namespace
);

const pvcToPods = makeRelation('pvc-pod', PersistentVolumeClaim, Pod, (pvc, pod) =>
  pod.spec.volumes?.find(volume => volume.persistentVolumeClaim?.claimName === pvc.metadata.name)
);

const podToOwner = makeOwnerRelation(Pod);
const replicaSetToOwner = makeOwnerRelation(ReplicaSet);

const useGetCRToOwnerRelations = () => {
  const namespace = useNamespaces();
  const { items: crds } = CustomResourceDefinition.useList({ namespace });

  return useMemo(() => {
    if (!crds) return [];

    return crds.map(crd => {
      const CRClass = crd.makeCRClass(); // or makeCRClass(crd)
      return makeOwnerRelationReversed(CRClass);
    });
  }, [crds]);
};

const jobToCronJob = makeRelation('job-cronjob', Job, CronJob, (job, cronJob) =>
  job.metadata.ownerReferences?.find(owner => owner.uid === cronJob.metadata.uid)
);

const jobToJobSet = makeRelation('job-jobset', Job, JobSet, (job, jobSet) =>
  job.metadata.ownerReferences?.find(owner => owner.uid === jobSet.metadata.uid)
);

const gatewayToGatewayClass = makeRelation(
  'gateway-gatewayclass',
  Gateway,
  GatewayClass,
  (gateway, gatewayClass) => gateway.spec?.gatewayClassName === gatewayClass.metadata.name
);

const httpRouteToGateway = makeRelation(
  'httproute-gateway',
  HTTPRoute,
  Gateway,
  (httpRoute, gateway) => httpRoute.spec.parentRefs?.find(ref => ref.name === gateway.metadata.name)
);

const httpRouteToService = makeRelation(
  'httproute-service',
  HTTPRoute,
  Service,
  (httpRoute, service) =>
    httpRoute.spec.rules?.find(rule =>
      rule.backendRefs?.find(backend => backend.name === service.metadata.name)
    )
);

const backendTLSPolicyToService = makeRelation(
  'backendtlspolicy-service',
  BackendTLSPolicy,
  Service,
  (tlsPolicy, service) =>
    tlsPolicy.spec.targetRef?.name === service.metadata.name &&
    tlsPolicy.spec.targetRef?.kind === 'Service'
);

const backendTrafficPolicyToService = makeRelation(
  'backendtrafficpolicy-service',
  BackendTrafficPolicy,
  Service,
  (trafficPolicy, service) =>
    trafficPolicy.spec.targetRef?.name === service.metadata.name &&
    trafficPolicy.spec.targetRef?.kind === 'Service'
);

const staticRelations = [
  configMapUsedInPods,
  configMapUsedInJobs,
  secretsUsedInPods,
  secretsUsedInJobs,
  hpaToDeployment,
  hpaToStatefulSet,
  vwcToService,
  mwcToService,
  serviceToPods,
  endpointsToServices,
  endpointSlicesToServices,
  ingressToService,
  ingressToSecret,
  networkPolicyToPod,
  roleBindingsToRole,
  roleBindingToServiceAccount,
  serviceAccountToDeployments,
  serviceAccountToDaemonSets,
  pvcToPods,
  podToOwner,
  replicaSetToOwner,
  jobToCronJob,
  jobToJobSet,
  gatewayToGatewayClass,
  httpRouteToGateway,
  httpRouteToService,
  backendTLSPolicyToService,
  backendTrafficPolicyToService,
];

export { BUILT_IN_RELATION_IDS };

export function useGetAllRelations(): Relation[] {
  const crdRelations = useGetCRToOwnerRelations();
  const pluginRelations = useTypedSelector(state => state.graphView.relations);

  const safePluginRelations = useMemo(() => {
    if (!pluginRelations) return [];
    return pluginRelations
      .filter(relation => typeof relation.predicate === 'function')
      .map(relation => {
        return {
          ...relation,
          predicate(from: GraphNode, to: GraphNode) {
            try {
              return relation.predicate(from, to);
            } catch (e) {
              console.error(`Error executing plugin relation predicate [${relation.id}]:`, e);
              return false;
            }
          },
        };
      });
  }, [pluginRelations]);

  return useMemo(
    () => [...staticRelations, ...crdRelations, ...safePluginRelations],
    [crdRelations, safePluginRelations]
  );
}
