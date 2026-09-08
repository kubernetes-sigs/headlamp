# Function: registerSetTokenFunction()

```ts
function registerSetTokenFunction(override: (cluster: string, token: string | null) => void): void;
```

Defined in: [plugin/registry.tsx:733](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L733)

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
