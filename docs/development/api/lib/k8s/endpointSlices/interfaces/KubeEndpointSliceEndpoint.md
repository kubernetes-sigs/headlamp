# Interface: KubeEndpointSliceEndpoint

## Properties

### addresses

```ts
addresses: string[];
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:27](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L27)

***

### conditions?

```ts
optional conditions: KubeEndpointSliceEndpointConditions;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:30](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L30)

***

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:28](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L28)

***

### nodeName?

```ts
optional nodeName: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:29](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L29)

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

[src/lib/k8s/endpointSlices.ts:32](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L32)

***

### zone?

```ts
optional zone: string;
```

#### Defined in

[src/lib/k8s/endpointSlices.ts:31](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/endpointSlices.ts#L31)
