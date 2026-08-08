# Function: useId()

```ts
function useId(prefix?: string): string;
```

Defined in: [lib/util.ts:601](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L601)

Creates a unique ID, with the given prefix.
If UNDER_TEST is set to true, it will return the same ID every time, so snapshots do not get invalidated.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `prefix` | `string` | `''` |

## Returns

`string`
