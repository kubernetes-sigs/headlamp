# Interface: ApiListSingleNamespaceOptions

## Properties

### cluster?

```ts
optional cluster: string;
```

The cluster to get the object from. By default uses the current cluster being viewed.

#### Defined in

[src/lib/k8s/KubeObject.ts:761](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L761)

***

### namespace?

```ts
optional namespace: string;
```

The namespace to get the object from.

#### Defined in

[src/lib/k8s/KubeObject.ts:757](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L757)

***

### queryParams?

```ts
optional queryParams: QueryParameters;
```

The parameters to be passed to the API endpoint.

#### Defined in

[src/lib/k8s/KubeObject.ts:759](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L759)
