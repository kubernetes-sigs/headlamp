# Function: stopOrDeletePortForward()

```ts
function stopOrDeletePortForward(
   cluster: string, 
   id: string, 
stopOrDelete?: boolean): Promise<string>;
```

Defined in: [lib/k8s/api/v1/portForward.ts:133](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/portForward.ts#L133)

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
