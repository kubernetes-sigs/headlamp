# Interface: KubeEndpointAddress

Defined in: [lib/k8s/endpoints.ts:28](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/endpoints.ts#L28)

## Properties

### hostname

```ts
hostname: string;
```

Defined in: [lib/k8s/endpoints.ts:29](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/endpoints.ts#L29)

***

### ip

```ts
ip: string;
```

Defined in: [lib/k8s/endpoints.ts:30](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/endpoints.ts#L30)

***

### nodeName?

```ts
optional nodeName?: string;
```

Defined in: [lib/k8s/endpoints.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/endpoints.ts#L31)

***

### targetRef?

```ts
optional targetRef?: Pick<KubeObjectInterface, "apiVersion" | "kind"> & Pick<KubeMetadata, "namespace" | "uid" | "name" | "resourceVersion"> & object;
```

Defined in: [lib/k8s/endpoints.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/endpoints.ts#L32)

#### Type Declaration

##### fieldPath

```ts
fieldPath: string;
```
