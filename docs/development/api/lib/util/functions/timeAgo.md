# Function: timeAgo()

```ts
function timeAgo(date: DateParam, options: TimeAgoOptions): string
```

Show the time passed since the given date, in the desired format.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `date` | [`DateParam`](../type-aliases/DateParam.md) | The date since which to calculate the duration. |
| `options` | [`TimeAgoOptions`](../interfaces/TimeAgoOptions.md) | `format` takes "brief" or "mini". "brief" rounds the date and uses the largest suitable unit (e.g. "4 weeks"). "mini" uses something like "4w" (for 4 weeks). |

## Returns

`string`

The formatted date.

## Defined in

[src/lib/util.ts:65](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/util.ts#L65)
