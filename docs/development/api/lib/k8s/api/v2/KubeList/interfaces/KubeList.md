# Interface: KubeList\<T\>

Defined in: [lib/k8s/api/v2/KubeList.ts:20](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L20)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### apiVersion

```ts
apiVersion: string;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:22](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L22)

***

### items

```ts
items: T[];
```

Defined in: [lib/k8s/api/v2/KubeList.ts:23](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L23)

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:21](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L21)

***

### metadata

```ts
metadata: object;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:24](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L24)

#### continue?

```ts
optional continue?: string;
```

Continuation token — present when more results exist beyond this page.

#### remainingItemCount?

```ts
optional remainingItemCount?: number;
```

Approximate count of remaining items beyond this page.

#### resourceVersion

```ts
resourceVersion: string;
```
