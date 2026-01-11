# Interface: KubeObjectInterface

This is the base interface for all Kubernetes resources, i.e. it contains fields
that all Kubernetes resources have.

## Extended by

- [`KubeBackendTLSPolicy`](../../backendTLSPolicy/interfaces/KubeBackendTLSPolicy.md)
- [`KubeBackendTrafficPolicy`](../../backendTrafficPolicy/interfaces/KubeBackendTrafficPolicy.md)
- [`KubeConfigMap`](../../configMap/interfaces/KubeConfigMap.md)
- [`KubeCRD`](../../crd/interfaces/KubeCRD.md)
- [`KubeCronJob`](../../cronJob/interfaces/KubeCronJob.md)
- [`KubeDaemonSet`](../../daemonSet/interfaces/KubeDaemonSet.md)
- [`KubeDeployment`](../../deployment/interfaces/KubeDeployment.md)
- [`KubeEndpointSlice`](../../endpointSlices/interfaces/KubeEndpointSlice.md)
- [`KubeEndpoint`](../../endpoints/interfaces/KubeEndpoint.md)
- [`KubeGateway`](../../gateway/interfaces/KubeGateway.md)
- [`KubeGatewayClass`](../../gatewayClass/interfaces/KubeGatewayClass.md)
- [`KubeGRPCRoute`](../../grpcRoute/interfaces/KubeGRPCRoute.md)
- [`KubeHPA`](../../hpa/interfaces/KubeHPA.md)
- [`KubeHTTPRoute`](../../httpRoute/interfaces/KubeHTTPRoute.md)
- [`KubeIngress`](../../ingress/interfaces/KubeIngress.md)
- [`KubeIngressClass`](../../ingressClass/interfaces/KubeIngressClass.md)
- [`KubeJob`](../../job/interfaces/KubeJob.md)
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
- [`KubeVPA`](../../vpa/interfaces/KubeVPA.md)

## Indexable

 \[`otherProps`: `string`\]: `any`

## Properties

### actionType?

```ts
optional actionType: any;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:728](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L728)

***

### apiVersion?

```ts
optional apiVersion: string;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:723](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L723)

***

### items?

```ts
optional items: any[];
```

#### Defined in

[src/lib/k8s/KubeObject.ts:727](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L727)

***

### key?

```ts
optional key: any;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:730](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L730)

***

### kind

```ts
kind: string;
```

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

#### See

[more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

#### Defined in

[src/lib/k8s/KubeObject.ts:722](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L722)

***

### lastTimestamp?

```ts
optional lastTimestamp: string;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:729](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L729)

***

### metadata

```ts
metadata: KubeMetadata;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:724](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L724)

***

### spec?

```ts
optional spec: any;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:725](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L725)

***

### status?

```ts
optional status: any;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:726](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L726)
