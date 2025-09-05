/*
 * This module was taken from the k8dash project.
 */

import { clusterRequest } from '@kinvolk/headlamp-plugin/lib/ApiProxy';
import { dereference } from '@readme/openapi-parser';

export async function getDocs(clusterName: string) {
  const response = await clusterRequest('/openapi/v2', {
    cluster: clusterName,
  });

  if (!response) {
    console.error('No response received from the request');
    throw new Error('No response received from the request');
  }

  const docs = await dereference(response);
  return docs;
}

export function getContextKeyword(url: string) {
  let contextResourceKind = '';

  // since all url resources are lower and plural, we can check if the url includes the word, we then return the singular form
  if (url.includes('/pods') || url.includes('/pods/')) {
    contextResourceKind = 'Pod';
  } else if (url.includes('/deployments') || url.includes('/deployments/')) {
    contextResourceKind = 'Deployment';
  } else if (url.includes('/statefulsets') || url.includes('/statefulsets/')) {
    contextResourceKind = 'StatefulSet';
  } else if (url.includes('/daemonsets') || url.includes('/daemonsets/')) {
    contextResourceKind = 'DaemonSet';
  } else if (url.includes('/replicasets') || url.includes('/replicasets/')) {
    contextResourceKind = 'ReplicaSet';
  } else if (url.includes('/jobs') || url.includes('/jobs/')) {
    contextResourceKind = 'Job';
  } else if (url.includes('/cronjobs') || url.includes('/cronjobs/')) {
    contextResourceKind = 'CronJob';
  } else if (url.includes('/persistentvolumeclaims') || url.includes('/persistentvolumeclaims/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'PersistentVolumeClaim';
  } else if (url.includes('/persistentvolumes') || url.includes('/persistentvolumes/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'PersistentVolume';
  } else if (url.includes('/storage/classes') || url.includes('/storage/classes/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'StorageClass';
  } else if (url.includes('/services') || url.includes('/services/')) {
    contextResourceKind = 'Service';
  } else if (url.includes('/endpoints') || url.includes('/endpoints/')) {
    contextResourceKind = 'Endpoint';
  } else if (url.includes('/ingresses') || url.includes('/ingresses/')) {
    contextResourceKind = 'Ingress';
  } else if (url.includes('/ingressclasses') || url.includes('/ingressclasses/')) {
    contextResourceKind = 'IngressClass';
  } else if (url.includes('/portforwards') || url.includes('/portforwards/')) {
    contextResourceKind = 'PortForward';
  } else if (url.includes('/networkpolicies') || url.includes('/networkpolicies/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'NetworkPolicy';
  } else if (url.includes('/serviceaccounts') || url.includes('/serviceaccounts/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'ServiceAccount';
  } else if (url.includes('/roles') || url.includes('/roles/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'Role';
  } else if (url.includes('/rolebindings') || url.includes('/rolebindings/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'RoleBinding';
  } else if (url.includes('/configmaps') || url.includes('/configmaps/')) {
    contextResourceKind = 'ConfigMap';
  } else if (url.includes('/secrets') || url.includes('/secrets/')) {
    contextResourceKind = 'Secret';
  } else if (
    url.includes('/horizontalpodautoscalers') ||
    url.includes('/horizontalpodautoscalers/')
  ) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'HorizontalPodAutoscaler';
  } else if (url.includes('/verticalpodautoscalers') || url.includes('/verticalpodautoscalers/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'VerticalPodAutoscaler';
  } else if (url.includes('/poddisruptionbudgets') || url.includes('/poddisruptionbudgets/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'PodDisruptionBudget';
  } else if (url.includes('/resourcequotas') || url.includes('/resourcequotas/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'ResourceQuota';
  } else if (url.includes('/limitranges') || url.includes('/limitranges/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'LimitRange';
  } else if (url.includes('/priorityclasses') || url.includes('/priorityclasses/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'PriorityClass';
  } else if (url.includes('/runtimeclasses') || url.includes('/runtimeclasses/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'RuntimeClass';
  } else if (url.includes('/leases') || url.includes('/leases/')) {
    contextResourceKind = 'Lease';
  } else if (
    url.includes('/mutatingwebhookconfigurations') ||
    url.includes('/mutatingwebhookconfigurations/')
  ) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'MutatingWebhookConfiguration';
  } else if (
    url.includes('/validatingwebhookconfigurations') ||
    url.includes('/validatingwebhookconfigurations/')
  ) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'ValidatingWebhookConfiguration';
  } else if (url.includes('/crds') || url.includes('/crds/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'CustomResourceDefinition';
  } else if (url.includes('/crs') || url.includes('/crs/')) {
    // need to check if this is the correct resource kind

    contextResourceKind = 'CustomResource';
  }

  return contextResourceKind;
}
