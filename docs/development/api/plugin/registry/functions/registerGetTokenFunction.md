# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => string | undefined): void;
```

Defined in: [plugin/registry.tsx:729](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L729)

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
