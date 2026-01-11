# Interface: KubeDaemonSet

This is the base interface for all Kubernetes resources, i.e. it contains fields
that all Kubernetes resources have.

## Extends

- [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)

## Properties

### actionType?

```ts
optional actionType: any;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`actionType`](../../KubeObject/interfaces/KubeObjectInterface.md#actiontype)

#### Defined in

[src/lib/k8s/KubeObject.ts:728](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L728)

***

### apiVersion?

```ts
optional apiVersion: string;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`apiVersion`](../../KubeObject/interfaces/KubeObjectInterface.md#apiversion)

#### Defined in

[src/lib/k8s/KubeObject.ts:723](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L723)

***

### items?

```ts
optional items: any[];
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`items`](../../KubeObject/interfaces/KubeObjectInterface.md#items)

#### Defined in

[src/lib/k8s/KubeObject.ts:727](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L727)

***

### key?

```ts
optional key: any;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`key`](../../KubeObject/interfaces/KubeObjectInterface.md#key)

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

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`kind`](../../KubeObject/interfaces/KubeObjectInterface.md#kind)

#### Defined in

[src/lib/k8s/KubeObject.ts:722](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L722)

***

### lastTimestamp?

```ts
optional lastTimestamp: string;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`lastTimestamp`](../../KubeObject/interfaces/KubeObjectInterface.md#lasttimestamp)

#### Defined in

[src/lib/k8s/KubeObject.ts:729](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L729)

***

### metadata

```ts
metadata: KubeMetadata;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`metadata`](../../KubeObject/interfaces/KubeObjectInterface.md#metadata)

#### Defined in

[src/lib/k8s/KubeObject.ts:724](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L724)

***

### spec

```ts
spec: object;
```

#### Index Signature

 \[`otherProps`: `string`\]: `any`

#### selector

```ts
selector: LabelSelector;
```

#### template

```ts
template: object;
```

#### template.metadata?

```ts
optional metadata: KubeMetadata;
```

#### template.spec

```ts
spec: KubePodSpec;
```

#### updateStrategy

```ts
updateStrategy: object;
```

#### updateStrategy.rollingUpdate

```ts
rollingUpdate: object;
```

#### updateStrategy.rollingUpdate.maxUnavailable

```ts
maxUnavailable: number;
```

#### updateStrategy.type

```ts
type: string;
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`spec`](../../KubeObject/interfaces/KubeObjectInterface.md#spec)

#### Defined in

[src/lib/k8s/daemonSet.ts:23](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/daemonSet.ts#L23)

***

### status

```ts
status: object;
```

#### Index Signature

 \[`otherProps`: `string`\]: `any`

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`status`](../../KubeObject/interfaces/KubeObjectInterface.md#status)

#### Defined in

[src/lib/k8s/daemonSet.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/daemonSet.ts#L37)
