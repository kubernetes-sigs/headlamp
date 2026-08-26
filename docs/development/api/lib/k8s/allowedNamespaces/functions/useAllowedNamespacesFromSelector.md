# Function: useAllowedNamespacesFromSelector()

```ts
function useAllowedNamespacesFromSelector(cluster: string, selector?: string): object;
```

Defined in: [lib/k8s/allowedNamespaces.ts:57](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/allowedNamespaces.ts#L57)

Resolves the namespaces matching a cluster's label selector and keeps the
localStorage cache read by getCombinedAllowedNamespaces in sync.

The resolution goes through Namespace.useList so it benefits from react-query
caching, retry and websocket watching. Because the query is keyed on the
selector, results are always tagged to the selector that produced them, which
avoids an older in-flight request overwriting a newer one.

Cache behaviour:
- success: the resolved names are cached, stamped with the selector and time;
- failure: the cache is cleared (fail closed) so a stale list is not kept;
- empty selector: any previously cached list is cleared.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to resolve the namespaces for. |
| `selector?` | `string` | The configured label selector (may be undefined/empty). |

## Returns

`object`

The resolved namespace names plus the current fetching/error state,
         for callers (e.g. the settings UI) that want to surface them.

### error

```ts
error: ApiError | null;
```

### isFetching

```ts
isFetching: boolean;
```

### isSuccess

```ts
isSuccess: boolean;
```

### namespaces

```ts
namespaces: string[];
```
