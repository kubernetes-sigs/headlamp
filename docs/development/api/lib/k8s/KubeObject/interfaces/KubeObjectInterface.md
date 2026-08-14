# Interface: KubeObjectInterface

Defined in: [lib/k8s/KubeObject.ts:777](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L777)

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
- [`KubeGateway`](../../gateway/interfaces/KubeGateway.md)
- [`KubeGatewayClass`](../../gatewayClass/interfaces/KubeGatewayClass.md)
- [`KubeGRPCRoute`](../../grpcRoute/interfaces/KubeGRPCRoute.md)
- [`KubeHPA`](../../hpa/interfaces/KubeHPA.md)
- [`KubeHTTPRoute`](../../httpRoute/interfaces/KubeHTTPRoute.md)
- [`KubeIngress`](../../ingress/interfaces/KubeIngress.md)
- [`KubeIngressClass`](../../ingressClass/interfaces/KubeIngressClass.md)
- [`KubeJob`](../../job/interfaces/KubeJob.md)
- [`KubeJobSet`](../../jobSet/interfaces/KubeJobSet.md)
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
- [`KubePriorityClass`](../../priorityClass/interfaces/KubePriorityClass.md)
- [`KubeReferenceGrant`](../../referenceGrant/interfaces/KubeReferenceGrant.md)
- [`KubeReplicaSet`](../../replicaSet/interfaces/KubeReplicaSet.md)
- [`KubeResourceQuota`](../../resourceQuota/interfaces/KubeResourceQuota.md)
- [`KubeRole`](../../role/interfaces/KubeRole.md)
- [`KubeRoleBinding`](../../roleBinding/interfaces/KubeRoleBinding.md)
- [`KubeRuntimeClass`](../../runtime/interfaces/KubeRuntimeClass.md)
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

Defined in: [lib/k8s/KubeObject.ts:794](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L794)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:789](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L789)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:793](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L793)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:796](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L796)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/KubeObject.ts:788](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L788)

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

Defined in: [lib/k8s/KubeObject.ts:795](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L795)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:790](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L790)

***

### spec?

```ts
optional spec?: any;
```

Defined in: [lib/k8s/KubeObject.ts:791](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L791)

***

### status?

```ts
optional status?: any;
```

Defined in: [lib/k8s/KubeObject.ts:792](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L792)
