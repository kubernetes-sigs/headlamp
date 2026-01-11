# Function: formatDuration()

```ts
function formatDuration(duration: number, options: TimeAgoOptions): string
```

Format a duration in milliseconds to a human-readable string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `duration` | `number` | The duration in milliseconds. |
| `options` | [`TimeAgoOptions`](../interfaces/TimeAgoOptions.md) | `format` takes "brief" or "mini". "brief" rounds the date and uses the largest suitable unit (e.g. "4 weeks"). "mini" uses something like "4w" (for 4 weeks). |

## Returns

`string`

The formatted duration.

## Defined in

[src/lib/util.ts:84](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L84)
