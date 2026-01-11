# Interface: KubeconfigObject

KubeconfigObject is the object that is stored in indexDB as string format.
It is a JSON encoded version of the kubeconfig file.
It is used to store the kubeconfig for stateless clusters.
This is basically a k8s client - go Kubeconfig object.
KubeconfigObject holds the information needed to build connect to remote kubernetes clusters as a given user
*

## See

 - [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/)
 - storeStatelessClusterKubeconfig
 - getStatelessClusterKubeConfigs
 - findKubeconfigByClusterName

## Properties

### apiVersion

```ts
apiVersion: string;
```

version of the kubeconfig file.

#### Defined in

[src/lib/k8s/kubeconfig.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L30)

***

### clusters

```ts
clusters: object[];
```

Clusters is a map of referencable names to cluster configs.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedCluster)

#### Defined in

[src/lib/k8s/kubeconfig.ts:50](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L50)

***

### contexts

```ts
contexts: object[];
```

Contexts is a map of referencable names to context configs.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedContext)

#### Defined in

[src/lib/k8s/kubeconfig.ts:146](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L146)

***

### current-context

```ts
current-context: string;
```

CurrentContext is the name of the context that you would like to use by default

#### Defined in

[src/lib/k8s/kubeconfig.ts:174](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L174)

***

### extensions?

```ts
optional extensions: object[];
```

Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedExtension)

#### Defined in

[src/lib/k8s/kubeconfig.ts:178](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L178)

***

### kind

```ts
kind: string;
```

kind is the type of the kubeconfig file. It is always 'Config'.

#### Defined in

[src/lib/k8s/kubeconfig.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L32)

***

### preferences?

```ts
optional preferences: object;
```

Preferences holds general information to be use for cli interactions

#### colors?

```ts
optional colors: boolean;
```

colors specifies whether output should use colors.

#### extensions?

```ts
optional extensions: object[];
```

extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Preferences object.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Preferences)

#### Defined in

[src/lib/k8s/kubeconfig.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L36)

***

### users

```ts
users: object[];
```

AuthInfos is a map of referencable names to user configs.

#### See

[more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedAuthInfo)

#### Defined in

[src/lib/k8s/kubeconfig.ts:83](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/kubeconfig.ts#L83)
