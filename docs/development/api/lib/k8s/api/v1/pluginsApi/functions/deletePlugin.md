# Function: deletePlugin()

```ts
function deletePlugin(name: string, type?: "development" | "user"): Promise<any>
```

Deletes the plugin with the specified name from the system.

This function sends a DELETE request to the server's plugin management
endpoint, targeting the plugin identified by its name and type.
The function handles the request asynchronously and returns a promise that
resolves when the deletion succeeds.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The unique name of the plugin to delete. This identifier is used to construct the URL for the DELETE request. |
| `type`? | `"development"` \| `"user"` | Optional plugin type ('development' or 'user'). If specified, only that specific plugin location is checked. If omitted, the backend will check both locations in priority order. |

## Returns

`Promise`\<`any`\>

Resolves to the parsed response body if present; otherwise `undefined`.

## Throws

— If the response status is not ok.

## Example

```ts
// Call to delete a plugin named 'examplePlugin' from user-plugins
deletePlugin('examplePlugin', 'user')
  .then(response => console.log('Plugin deleted successfully', response))
  .catch(error => console.error('Failed to delete plugin', error));
```

## Defined in

[src/lib/k8s/api/v1/pluginsApi.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/pluginsApi.ts#L43)
