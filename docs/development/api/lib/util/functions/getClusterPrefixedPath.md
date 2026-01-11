# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: null | string): string
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path`? | `null` \| `string` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.

## Defined in

[src/lib/cluster.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/cluster.ts#L27)
