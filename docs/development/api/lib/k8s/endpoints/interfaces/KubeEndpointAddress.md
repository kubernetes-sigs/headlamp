# Interface: KubeEndpointAddress

## Properties

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/endpoints.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpoints.ts#L29)

***

### ip

```ts
ip: string;
```

#### Defined in

[src/lib/k8s/endpoints.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpoints.ts#L30)

***

### nodeName?

```ts
optional nodeName: string;
```

#### Defined in

[src/lib/k8s/endpoints.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpoints.ts#L31)

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

[src/lib/k8s/endpoints.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/endpoints.ts#L32)
