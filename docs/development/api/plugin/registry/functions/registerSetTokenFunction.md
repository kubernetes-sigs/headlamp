# Function: registerSetTokenFunction()

```ts
function registerSetTokenFunction(override: (cluster: string, token: null | string) => void): void
```

Override headlamp setToken method

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `override` | (`cluster`: `string`, `token`: `null` \| `string`) => `void` | The setToken override method to use. |

## Returns

`void`

## Example

```ts
registerSetTokenFunction((cluster: string, token: string | null) => {
// set token logic here
});
```

## Defined in

[src/plugin/registry.tsx:680](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L680)
