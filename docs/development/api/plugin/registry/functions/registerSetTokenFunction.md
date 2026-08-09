# Function: registerSetTokenFunction()

```ts
function registerSetTokenFunction(override: (cluster: string, token: string | null) => void): void;
```

Defined in: [plugin/registry.tsx:713](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L713)

Override headlamp setToken method

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `override` | (`cluster`: `string`, `token`: `string` \| `null`) => `void` | The setToken override method to use. |

## Returns

`void`

## Example

```ts
registerSetTokenFunction((cluster: string, token: string | null) => {
// set token logic here
});
```
