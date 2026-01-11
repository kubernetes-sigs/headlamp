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

[src/plugin/registry.tsx:680](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L680)
