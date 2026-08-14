# Interface: KubeEndpointSliceEndpoint

Defined in: [lib/k8s/endpointSlices.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L26)

## Properties

### addresses

```ts
addresses: string[];
```

Defined in: [lib/k8s/endpointSlices.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L27)

***

### conditions?

```ts
optional conditions?: KubeEndpointSliceEndpointConditions;
```

Defined in: [lib/k8s/endpointSlices.ts:30](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L30)

***

### hostname

```ts
hostname: string;
```

Defined in: [lib/k8s/endpointSlices.ts:28](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L28)

***

### nodeName?

```ts
optional nodeName?: string;
```

Defined in: [lib/k8s/endpointSlices.ts:29](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L29)

***

### targetRef?

```ts
optional targetRef?: Pick<KubeObjectInterface, "apiVersion" | "kind"> & Pick<KubeMetadata, "namespace" | "uid" | "name" | "resourceVersion"> & object;
```

Defined in: [lib/k8s/endpointSlices.ts:32](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L32)

#### Type Declaration

##### fieldPath

```ts
fieldPath: string;
```

***

### zone?

```ts
optional zone?: string;
```

Defined in: [lib/k8s/endpointSlices.ts:31](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/endpointSlices.ts#L31)
