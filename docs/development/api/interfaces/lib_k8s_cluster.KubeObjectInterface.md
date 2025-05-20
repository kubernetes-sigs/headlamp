[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeObjectInterface

# Interface: KubeObjectInterface

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeObjectInterface

This is the base interface for all Kubernetes resources, i.e. it contains fields
that all Kubernetes resources have.

## Hierarchy

- **`KubeObjectInterface`**

  ↳ [`KubeConfigMap`](lib_k8s_configMap.KubeConfigMap.md)

  ↳ [`KubeCRD`](lib_k8s_crd.KubeCRD.md)

  ↳ [`KubeCronJob`](lib_k8s_cronJob.KubeCronJob.md)

  ↳ [`KubeDaemonSet`](lib_k8s_daemonSet.KubeDaemonSet.md)

  ↳ [`KubeDeployment`](lib_k8s_deployment.KubeDeployment.md)

  ↳ [`KubeEndpoint`](lib_k8s_endpoints.KubeEndpoint.md)

  ↳ [`KubeHPA`](lib_k8s_hpa.KubeHPA.md)

  ↳ [`KubeIngress`](lib_k8s_ingress.KubeIngress.md)

  ↳ [`KubeIngressClass`](lib_k8s_ingressClass.KubeIngressClass.md)

  ↳ [`KubeJob`](lib_k8s_job.KubeJob.md)

  ↳ [`KubeLease`](lib_k8s_lease.KubeLease.md)

  ↳ [`KubeLimitRange`](lib_k8s_limitRange.KubeLimitRange.md)

  ↳ [`KubeMutatingWebhookConfiguration`](lib_k8s_mutatingWebhookConfiguration.KubeMutatingWebhookConfiguration.md)

  ↳ [`KubeNamespace`](lib_k8s_namespace.KubeNamespace.md)

  ↳ [`KubeNetworkPolicy`](lib_k8s_networkpolicy.KubeNetworkPolicy.md)

  ↳ [`KubeNode`](lib_k8s_node.KubeNode.md)

  ↳ [`KubePersistentVolume`](lib_k8s_persistentVolume.KubePersistentVolume.md)

  ↳ [`KubePersistentVolumeClaim`](lib_k8s_persistentVolumeClaim.KubePersistentVolumeClaim.md)

  ↳ [`KubePod`](lib_k8s_pod.KubePod.md)

  ↳ [`KubePDB`](lib_k8s_podDisruptionBudget.KubePDB.md)

  ↳ [`KubePriorityClass`](lib_k8s_priorityClass.KubePriorityClass.md)

  ↳ [`KubeReplicaSet`](lib_k8s_replicaSet.KubeReplicaSet.md)

  ↳ [`KubeResourceQuota`](lib_k8s_resourceQuota.KubeResourceQuota.md)

  ↳ [`KubeRole`](lib_k8s_role.KubeRole.md)

  ↳ [`KubeRoleBinding`](lib_k8s_roleBinding.KubeRoleBinding.md)

  ↳ [`KubeRuntimeClass`](lib_k8s_runtime.KubeRuntimeClass.md)

  ↳ [`KubeSecret`](lib_k8s_secret.KubeSecret.md)

  ↳ [`KubeService`](lib_k8s_service.KubeService.md)

  ↳ [`KubeServiceAccount`](lib_k8s_serviceAccount.KubeServiceAccount.md)

  ↳ [`KubeStatefulSet`](lib_k8s_statefulSet.KubeStatefulSet.md)

  ↳ [`KubeStorageClass`](lib_k8s_storageClass.KubeStorageClass.md)

  ↳ [`KubeToken`](lib_k8s_token.KubeToken.md)

  ↳ [`KubeValidatingWebhookConfiguration`](lib_k8s_validatingWebhookConfiguration.KubeValidatingWebhookConfiguration.md)

  ↳ [`KubeVPA`](lib_k8s_vpa.KubeVPA.md)

## Indexable

▪ [otherProps: `string`]: `any`

## Properties

### apiVersion

• `Optional` **apiVersion**: `string`

#### Defined in

[lib/k8s/cluster.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L56)

___

### kind

• **kind**: `string`

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

**`see`** [more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

#### Defined in

[lib/k8s/cluster.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L55)

___

### metadata

• **metadata**: [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md)

#### Defined in

[lib/k8s/cluster.ts:57](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L57)
