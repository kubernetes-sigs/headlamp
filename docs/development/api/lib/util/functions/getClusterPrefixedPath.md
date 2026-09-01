# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: string | null): string;
```

Defined in: [lib/cluster.ts:27](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/cluster.ts#L27)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` \| `null` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.
