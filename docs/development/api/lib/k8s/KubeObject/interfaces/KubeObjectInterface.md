# Interface: KubeObjectInterface

Defined in: [lib/k8s/KubeObject.ts:729](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L729)

This is the base interface for all Kubernetes resources, i.e. it contains fields
that all Kubernetes resources have.

## Extended by

- [`KubeBackendTLSPolicy`](../../backendTLSPolicy/interfaces/KubeBackendTLSPolicy.md)
- [`KubeBackendTrafficPolicy`](../../backendTrafficPolicy/interfaces/KubeBackendTrafficPolicy.md)
- [`KubeConfigMap`](../../configMap/interfaces/KubeConfigMap.md)
- [`KubeControllerRevision`](../../controllerRevision/interfaces/KubeControllerRevision.md)
- [`KubeCRD`](../../crd/interfaces/KubeCRD.md)
- [`KubeCronJob`](../../cronJob/interfaces/KubeCronJob.md)
- [`KubeDaemonSet`](../../daemonSet/interfaces/KubeDaemonSet.md)
- [`KubeDeployment`](../../deployment/interfaces/KubeDeployment.md)
- [`KubeEndpoint`](../../endpoints/interfaces/KubeEndpoint.md)
- [`KubeEndpointSlice`](../../endpointSlices/interfaces/KubeEndpointSlice.md)
- [`KubeGatewayL4Route`](../../gateway/interfaces/KubeGatewayL4Route.md)
- [`KubeGateway`](../../gateway/interfaces/KubeGateway.md)
- [`KubeGatewayClass`](../../gatewayClass/interfaces/KubeGatewayClass.md)
- [`KubeGRPCRoute`](../../grpcRoute/interfaces/KubeGRPCRoute.md)
- [`KubeHPA`](../../hpa/interfaces/KubeHPA.md)
- [`KubeHTTPRoute`](../../httpRoute/interfaces/KubeHTTPRoute.md)
- [`KubeIngress`](../../ingress/interfaces/KubeIngress.md)
- [`KubeIngressClass`](../../ingressClass/interfaces/KubeIngressClass.md)
- [`KubeJob`](../../job/interfaces/KubeJob.md)
- [`KubeJobSet`](../../jobSet/interfaces/KubeJobSet.md)
- [`KubeLeaderWorkerSet`](../../leaderWorkerSet/interfaces/KubeLeaderWorkerSet.md)
- [`KubeLease`](../../lease/interfaces/KubeLease.md)
- [`KubeLimitRange`](../../limitRange/interfaces/KubeLimitRange.md)
- [`KubeMutatingWebhookConfiguration`](../../mutatingWebhookConfiguration/interfaces/KubeMutatingWebhookConfiguration.md)
- [`KubeNamespace`](../../namespace/interfaces/KubeNamespace.md)
- [`KubeNetworkPolicy`](../../networkpolicy/interfaces/KubeNetworkPolicy.md)
- [`KubeNode`](../../node/interfaces/KubeNode.md)
- [`KubePersistentVolume`](../../persistentVolume/interfaces/KubePersistentVolume.md)
- [`KubePersistentVolumeClaim`](../../persistentVolumeClaim/interfaces/KubePersistentVolumeClaim.md)
- [`KubePod`](../../pod/interfaces/KubePod.md)
- [`KubePDB`](../../podDisruptionBudget/interfaces/KubePDB.md)
- [`KubePodGroup`](../../podGroup/interfaces/KubePodGroup.md)
- [`KubePriorityClass`](../../priorityClass/interfaces/KubePriorityClass.md)
- [`KubeReferenceGrant`](../../referenceGrant/interfaces/KubeReferenceGrant.md)
- [`KubeReplicaSet`](../../replicaSet/interfaces/KubeReplicaSet.md)
- [`KubeResourceQuota`](../../resourceQuota/interfaces/KubeResourceQuota.md)
- [`KubeRole`](../../role/interfaces/KubeRole.md)
- [`KubeRoleBinding`](../../roleBinding/interfaces/KubeRoleBinding.md)
- [`KubeRuntimeClass`](../../runtime/interfaces/KubeRuntimeClass.md)
- [`KubeSchedulingWorkload`](../../schedulingWorkload/interfaces/KubeSchedulingWorkload.md)
- [`KubeSecret`](../../secret/interfaces/KubeSecret.md)
- [`KubeService`](../../service/interfaces/KubeService.md)
- [`KubeServiceAccount`](../../serviceAccount/interfaces/KubeServiceAccount.md)
- [`KubeStatefulSet`](../../statefulSet/interfaces/KubeStatefulSet.md)
- [`KubeStorageClass`](../../storageClass/interfaces/KubeStorageClass.md)
- [`KubeToken`](../../token/interfaces/KubeToken.md)
- [`KubeValidatingWebhookConfiguration`](../../validatingWebhookConfiguration/interfaces/KubeValidatingWebhookConfiguration.md)
- [`KubeVolumeAttributesClass`](../../volumeAttributesClass/interfaces/KubeVolumeAttributesClass.md)
- [`KubeVPA`](../../vpa/interfaces/KubeVPA.md)

## Indexable

```ts
[otherProps: string]: any
```

## Properties

### actionType?

```ts
optional actionType?: any;
```

Defined in: [lib/k8s/KubeObject.ts:746](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L746)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:741](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L741)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:745](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L745)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:748](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L748)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/KubeObject.ts:740](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L740)

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

#### See

[more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

***

### lastTimestamp?

```ts
optional lastTimestamp?: string;
```

Defined in: [lib/k8s/KubeObject.ts:747](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L747)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:742](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L742)

***

### spec?

```ts
optional spec?: any;
```

Defined in: [lib/k8s/KubeObject.ts:743](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L743)

***

### status?

```ts
optional status?: any;
```

Defined in: [lib/k8s/KubeObject.ts:744](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L744)
