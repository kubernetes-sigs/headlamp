# Interface: KubeObjectInterface

Defined in: [lib/k8s/KubeObject.ts:661](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L661)

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

Defined in: [lib/k8s/KubeObject.ts:678](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L678)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:673](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L673)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:677](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L677)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:680](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L680)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/KubeObject.ts:672](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L672)

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

Defined in: [lib/k8s/KubeObject.ts:679](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L679)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:674](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L674)

***

### spec?

```ts
optional spec?: any;
```

Defined in: [lib/k8s/KubeObject.ts:675](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L675)

***

### status?

```ts
optional status?: any;
```

Defined in: [lib/k8s/KubeObject.ts:676](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L676)
