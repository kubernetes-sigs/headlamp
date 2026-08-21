# Function: registerGetTokenFunction()

```ts
function registerGetTokenFunction(override: (cluster: string) => string | undefined): void;
```

Defined in: [plugin/registry.tsx:751](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L751)

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
