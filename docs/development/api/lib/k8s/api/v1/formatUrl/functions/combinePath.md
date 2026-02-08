# Function: combinePath()

```ts
function combinePath(base: string, path: string): string
```

Combines a base path and a path to create a full path.

Doesn't matter if the start or the end has a single slash, the result will always have a single slash.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `base` | `string` | The base path. |
| `path` | `string` | The path to combine with the base path. |

## Returns

`string`

The combined path.

## Defined in

[src/lib/k8s/api/v1/formatUrl.ts:35](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/formatUrl.ts#L35)
