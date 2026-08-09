# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => string | undefined): void;
```

Defined in: [plugin/registry.tsx:731](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L731)

Override headlamp getToken method

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `override` | (`cluster`: `string`) => `string` \| `undefined` | The getToken override method to use. |

## Returns

`void`

## Example

```ts
registerGetTokenFunction(() => {
// set token logic here
});
```
