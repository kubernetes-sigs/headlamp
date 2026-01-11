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

[src/plugin/registry.tsx:698](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L698)
