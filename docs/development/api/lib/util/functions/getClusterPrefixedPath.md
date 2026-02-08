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

[src/lib/cluster.ts:27](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/cluster.ts#L27)
