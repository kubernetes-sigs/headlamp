# Interface: KubeObjectInterface

Defined in: [lib/k8s/KubeObject.ts:780](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L780)

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
- [`KubeEndpointSlice`](../../endpointSlices/interfaces/KubeEndpointSlice.md)
- [`KubeEndpoint`](../../endpoints/interfaces/KubeEndpoint.md)
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

Defined in: [lib/k8s/KubeObject.ts:797](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L797)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:792](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L792)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:796](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L796)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:799](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L799)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/KubeObject.ts:791](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L791)

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

Defined in: [lib/k8s/KubeObject.ts:798](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L798)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:793](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L793)

***

### spec?

```ts
optional spec?: any;
```

Defined in: [lib/k8s/KubeObject.ts:794](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L794)

***

### status?

```ts
optional status?: any;
```

Defined in: [lib/k8s/KubeObject.ts:795](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L795)
