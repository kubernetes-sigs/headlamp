import ConfigMap from '../../../../lib/k8s/configMap';
import CronJob from '../../../../lib/k8s/cronJob';
import DaemonSet from '../../../../lib/k8s/daemonSet';
import Deployment from '../../../../lib/k8s/deployment';
import Endpoints from '../../../../lib/k8s/endpoints';
import Ingress from '../../../../lib/k8s/ingress';
import Job from '../../../../lib/k8s/job';
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
import ValidatingWebhookConfiguration from '../../../../lib/k8s/validatingWebhookConfiguration';
import { Relation } from '../../graph/graphModel';

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
  from: From,
  to: To,
  selector: (a: InstanceType<From>, b: InstanceType<To>) => unknown
): Relation => ({
  fromSource: from.kind,
  toSource: to.kind,
  predicate(fromNode, toNode) {
    const fromObject = fromNode.kubeObject as InstanceType<From>;
    const toObject = toNode.kubeObject as InstanceType<To>;

    return fromObject.cluster === toObject.cluster && Boolean(selector(fromObject, toObject));
  },
});

const makeOwnerRelation = (cl: KubeObjectClass): Relation => ({
  fromSource: cl.kind,
  predicate(from, to) {
    const obj = from.kubeObject as KubeObject;

    return (
      obj.metadata.ownerReferences?.find(owner => owner.uid === to.kubeObject?.metadata?.uid) !==
      undefined
    );
  },
});

const configMapUsedInPods = makeRelation(Pod, ConfigMap, (pod, configMap) =>
  pod.spec.volumes?.find(volume => volume.configMap?.name === configMap.metadata.name)
);

const configMapUsedInJobs = makeRelation(Job, ConfigMap, (job, configMap) =>
  job.spec.template.spec.volumes?.find(
    volume => volume?.configMap?.name === configMap.metadata.name
  )
);

const secretsUsedInPods = makeRelation(
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

const secretsUsedInJobs = makeRelation(Job, Secret, (job, secret) =>
  job.spec.template.spec.containers?.find(container =>
    container.env?.find(env => secret.metadata.name === env.valueFrom?.secretKeyRef?.name)
  )
);

const vwcToService = makeRelation(ValidatingWebhookConfiguration, Service, (vwc, service) =>
  vwc.webhooks.find(webhook => service.metadata.name === webhook.clientConfig.service?.name)
);

const mwcToService = makeRelation(MutatingWebhookConfiguration, Service, (mwc, service) =>
  mwc.webhooks.find(webhook => service.metadata.name === webhook.clientConfig.service?.name)
);

const serviceToPods = makeRelation(Service, Pod, (service, pod) =>
  matchesLabels(service.spec.selector, pod)
);

const endpointsToServices = makeRelation(
  Endpoints,
  Service,
  (endpoint, service) => endpoint.getName() === service.getName()
);

const ingressToService = makeRelation(Ingress, Service, (ingress, service) =>
  ingress.spec.rules.find((rule: any) =>
    rule.http?.paths?.find((path: any) => service.metadata.name === path?.backend?.service?.name)
  )
);

const ingressToSecret = makeRelation(Ingress, Secret, (ingress, secret) =>
  ingress.spec.tls?.find(tls => tls.secretName === secret.metadata.name)
);

const networkPolicyToPod = makeRelation(NetworkPolicy, Pod, (np, pod) =>
  matchesLabels(np.jsonData.spec.podSelector.matchLabels, pod)
);

const roleBindingsToRole = makeRelation(
  RoleBinding,
  Role,
  (binding, role) => role.metadata.name === binding.roleRef.name
);

const roleBindingToServiceAccount = makeRelation(RoleBinding, ServiceAccount, (binding, sa) =>
  binding.subjects.find(
    subject => subject.kind === 'ServiceAccount' && sa.metadata.name === subject.name
  )
);

const serviceAccountToDeployments = makeRelation(
  ServiceAccount,
  Deployment,
  (sa, deployment) =>
    (deployment.spec?.template?.spec?.serviceAccountName ?? 'default') === sa.metadata.name &&
    deployment.metadata.namespace === sa.metadata.namespace
);

const serviceAccountToDaemonSets = makeRelation(
  ServiceAccount,
  DaemonSet,
  (sa, ds) =>
    (ds.spec?.template?.spec?.serviceAccountName ?? 'default') === sa.metadata.name &&
    ds.metadata.namespace === sa.metadata.namespace
);

const pvcToPods = makeRelation(PersistentVolumeClaim, Pod, (pvc, pod) =>
  pod.spec.volumes?.find(volume => volume.persistentVolumeClaim?.claimName === pvc.metadata.name)
);

const podToOwner = makeOwnerRelation(Pod);
const repliaceSetToOwner = makeOwnerRelation(ReplicaSet);

const jobToCronJob = makeRelation(Job, CronJob, (job, cronJob) =>
  job.metadata.ownerReferences?.find(owner => owner.uid === cronJob.metadata.uid)
);

export const kubeObjectRelations = [
  configMapUsedInPods,
  configMapUsedInJobs,
  secretsUsedInPods,
  secretsUsedInJobs,
  vwcToService,
  mwcToService,
  serviceToPods,
  endpointsToServices,
  ingressToService,
  ingressToSecret,
  networkPolicyToPod,
  roleBindingsToRole,
  roleBindingToServiceAccount,
  serviceAccountToDeployments,
  serviceAccountToDaemonSets,
  pvcToPods,
  podToOwner,
  repliaceSetToOwner,
  jobToCronJob,
];
