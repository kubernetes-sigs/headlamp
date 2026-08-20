# Interface: KubeGatewayClass

Defined in: [lib/k8s/gatewayClass.ts:28](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gatewayClass.ts#L28)

GatewayClass is cluster-scoped resource defined by the infrastructure provider. This resource represents a class of Gateways that can be instantiated.

## See

 - [https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#gatewayclass](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#gatewayclass) Gateway API reference for GatewayClass
 - [https://gateway-api.sigs.k8s.io/reference/api-types/gatewayclass/](https://gateway-api.sigs.k8s.io/reference/api-types/gatewayclass/) Gateway API definition for GatewayClass

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

Defined in: [lib/k8s/gatewayClass.ts:29](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gatewayClass.ts#L29)

#### Index Signature

```ts
[key: string]: any
```

#### controllerName

```ts
controllerName: string;
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`spec`](../../KubeObject/interfaces/KubeObjectInterface.md#spec)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/gatewayClass.ts:33](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gatewayClass.ts#L33)

#### Index Signature

```ts
[otherProps: string]: any
```

#### conditions?

```ts
optional conditions?: KubeCondition[];
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`status`](../../KubeObject/interfaces/KubeObjectInterface.md#status)
