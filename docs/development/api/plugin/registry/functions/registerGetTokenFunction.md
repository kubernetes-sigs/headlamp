# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => undefined | string): void
```

Override headlamp getToken method

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `override` | (`cluster`: `string`) => `undefined` \| `string` | The getToken override method to use. |

## Returns

`void`

## Example

```ts
registerGetTokenFunction(() => {
// set token logic here
});
```

## Defined in

[src/plugin/registry.tsx:698](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L698)
