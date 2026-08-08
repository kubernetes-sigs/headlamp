# Interface: KubePDB

Defined in: [lib/k8s/podDisruptionBudget.ts:20](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/podDisruptionBudget.ts#L20)

This is the base interface for all Kubernetes resources, i.e. it contains fields
that all Kubernetes resources have.

## Extends

- [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)

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

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`actionType`](../../KubeObject/interfaces/KubeObjectInterface.md#actiontype)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:789](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L789)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`apiVersion`](../../KubeObject/interfaces/KubeObjectInterface.md#apiversion)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:793](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L793)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`items`](../../KubeObject/interfaces/KubeObjectInterface.md#items)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:796](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L796)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`key`](../../KubeObject/interfaces/KubeObjectInterface.md#key)

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

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`kind`](../../KubeObject/interfaces/KubeObjectInterface.md#kind)

***

### lastTimestamp?

```ts
optional lastTimestamp?: string;
```

Defined in: [lib/k8s/KubeObject.ts:795](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L795)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`lastTimestamp`](../../KubeObject/interfaces/KubeObjectInterface.md#lasttimestamp)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:790](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L790)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`metadata`](../../KubeObject/interfaces/KubeObjectInterface.md#metadata)

***

### spec

```ts
spec: object;
```

Defined in: [lib/k8s/podDisruptionBudget.ts:21](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/podDisruptionBudget.ts#L21)

#### maxUnavailable?

```ts
optional maxUnavailable?: number;
```

#### minAvailable?

```ts
optional minAvailable?: number;
```

#### selector

```ts
selector: object;
```

##### selector.matchExpressions?

```ts
optional matchExpressions?: object;
```

##### selector.matchExpressions.key

```ts
key: string;
```

##### selector.matchExpressions.operator

```ts
operator: string;
```

##### selector.matchExpressions.values

```ts
values: string[];
```

##### selector.matchLabels

```ts
matchLabels: object;
```

###### Index Signature

```ts
[key: string]: string
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`spec`](../../KubeObject/interfaces/KubeObjectInterface.md#spec)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/podDisruptionBudget.ts:35](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/podDisruptionBudget.ts#L35)

#### conditions

```ts
conditions: object[];
```

#### currentHealthy

```ts
currentHealthy: number;
```

#### desiredHealthy

```ts
desiredHealthy: number;
```

#### disruptedPods?

```ts
optional disruptedPods?: object;
```

##### Index Signature

```ts
[key: string]: string
```

#### disruptionsAllowed

```ts
disruptionsAllowed: number;
```

#### expectedPods

```ts
expectedPods: number;
```

#### observedGeneration

```ts
observedGeneration: number;
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`status`](../../KubeObject/interfaces/KubeObjectInterface.md#status)
