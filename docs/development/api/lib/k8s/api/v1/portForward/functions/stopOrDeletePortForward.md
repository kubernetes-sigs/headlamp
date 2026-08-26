# Function: stopOrDeletePortForward()

```ts
function stopOrDeletePortForward(
   cluster: string, 
   id: string, 
stopOrDelete?: boolean): Promise<string>;
```

Defined in: [lib/k8s/api/v1/portForward.ts:133](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/portForward.ts#L133)

Stops or deletes a portforward with the specified details.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `cluster` | `string` | `undefined` | The cluster to portforward for. |
| `id` | `string` | `undefined` | The id to portforward for. |
| `stopOrDelete` | `boolean` | `true` | Whether to stop or delete the portforward. True for stop, false for delete. |

## Returns

`Promise`\<`string`\>

The response from the API.

## Throws

if the request fails.
