# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => string | undefined): void;
```

Defined in: [plugin/registry.tsx:751](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L751)

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
