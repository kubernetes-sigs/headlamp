# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => string | undefined): void;
```

Defined in: [plugin/registry.tsx:729](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L729)

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
