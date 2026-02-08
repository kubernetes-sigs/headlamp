# Interface: ApiListSingleNamespaceOptions

## Properties

### cluster?

```ts
optional cluster: string;
```

The cluster to get the object from. By default uses the current cluster being viewed.

#### Defined in

[src/lib/k8s/KubeObject.ts:761](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/KubeObject.ts#L761)

***

### namespace?

```ts
optional namespace: string;
```

The namespace to get the object from.

#### Defined in

[src/lib/k8s/KubeObject.ts:757](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/KubeObject.ts#L757)

***

### queryParams?

```ts
optional queryParams: QueryParameters;
```

The parameters to be passed to the API endpoint.

#### Defined in

[src/lib/k8s/KubeObject.ts:759](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/KubeObject.ts#L759)
