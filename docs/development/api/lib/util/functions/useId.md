# Function: useId()

```ts
function useId(prefix?: string): string;
```

Defined in: [lib/util.ts:601](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/util.ts#L601)

Creates a unique ID, with the given prefix.
If UNDER_TEST is set to true, it will return the same ID every time, so snapshots do not get invalidated.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `prefix` | `string` | `''` |

## Returns

`string`
