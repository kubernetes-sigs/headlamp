# Interface: KubeEndpointSliceEndpoint

## Properties

### addresses

```ts
addresses: string[];
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L27)

***

### conditions?

```ts
optional conditions: KubeEndpointSliceEndpointConditions;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L30)

***

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:28](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L28)

***

### nodeName?

```ts
optional nodeName: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L29)

***

### targetRef?

```ts
optional targetRef: Pick<KubeObjectInterface, "apiVersion" | "kind"> & Pick<KubeMetadata, "namespace" | "uid" | "name" | "resourceVersion"> & object;
```

#### Type declaration

##### fieldPath

```ts
fieldPath: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L32)

***

### zone?

```ts
optional zone: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpointSlices.ts#L31)
