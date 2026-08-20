# Interface: KubeService

Defined in: [lib/k8s/service.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/service.ts#L43)

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

Defined in: [lib/k8s/KubeObject.ts:746](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L746)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`actionType`](../../KubeObject/interfaces/KubeObjectInterface.md#actiontype)

***

### apiVersion?

```ts
optional apiVersion?: string;
```

Defined in: [lib/k8s/KubeObject.ts:741](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L741)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`apiVersion`](../../KubeObject/interfaces/KubeObjectInterface.md#apiversion)

***

### items?

```ts
optional items?: any[];
```

Defined in: [lib/k8s/KubeObject.ts:745](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L745)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`items`](../../KubeObject/interfaces/KubeObjectInterface.md#items)

***

### key?

```ts
optional key?: any;
```

Defined in: [lib/k8s/KubeObject.ts:748](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L748)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`key`](../../KubeObject/interfaces/KubeObjectInterface.md#key)

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

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`kind`](../../KubeObject/interfaces/KubeObjectInterface.md#kind)

***

### lastTimestamp?

```ts
optional lastTimestamp?: string;
```

Defined in: [lib/k8s/KubeObject.ts:747](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L747)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`lastTimestamp`](../../KubeObject/interfaces/KubeObjectInterface.md#lasttimestamp)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:742](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L742)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`metadata`](../../KubeObject/interfaces/KubeObjectInterface.md#metadata)

***

### spec

```ts
spec: object;
```

Defined in: [lib/k8s/service.ts:44](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/service.ts#L44)

#### Index Signature

```ts
[otherProps: string]: any
```

#### clusterIP

```ts
clusterIP: string;
```

#### clusterIPs?

```ts
optional clusterIPs?: string[];
```

#### externalIPs

```ts
externalIPs: string[];
```

#### externalName?

```ts
optional externalName?: string;
```

#### externalTrafficPolicy?

```ts
optional externalTrafficPolicy?: string;
```

#### healthCheckNodePort?

```ts
optional healthCheckNodePort?: number;
```

#### internalTrafficPolicy?

```ts
optional internalTrafficPolicy?: string;
```

#### ipFamilies?

```ts
optional ipFamilies?: string[];
```

#### ipFamilyPolicy?

```ts
optional ipFamilyPolicy?: string;
```

#### loadBalancerClass?

```ts
optional loadBalancerClass?: string;
```

#### loadBalancerIP?

```ts
optional loadBalancerIP?: string;
```

#### loadBalancerSourceRanges?

```ts
optional loadBalancerSourceRanges?: string[];
```

#### ports?

```ts
optional ports?: KubeServicePort[];
```

#### selector

```ts
selector: object;
```

##### Index Signature

```ts
[key: string]: string
```

#### sessionAffinity?

```ts
optional sessionAffinity?: string;
```

#### sessionAffinityConfig?

```ts
optional sessionAffinityConfig?: object;
```

##### sessionAffinityConfig.clientIP?

```ts
optional clientIP?: object;
```

##### sessionAffinityConfig.clientIP.timeoutSeconds?

```ts
optional timeoutSeconds?: number;
```

#### trafficDistribution?

```ts
optional trafficDistribution?: string;
```

#### type

```ts
type: string;
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`spec`](../../KubeObject/interfaces/KubeObjectInterface.md#spec)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/service.ts:71](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/service.ts#L71)

#### conditions?

```ts
optional conditions?: KubeCondition[];
```

#### loadBalancer?

```ts
optional loadBalancer?: object;
```

##### loadBalancer.ingress

```ts
ingress: KubeLoadBalancerIngress[];
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`status`](../../KubeObject/interfaces/KubeObjectInterface.md#status)
