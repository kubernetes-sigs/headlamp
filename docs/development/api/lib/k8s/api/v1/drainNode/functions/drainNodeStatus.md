# Function: drainNodeStatus()

```ts
function drainNodeStatus(cluster: string, nodeName: string): Promise<DrainNodeStatus>
```

Get the status of the drain node process.

It is used in the node detail page.
As draining a node is a long running process, we poll this endpoint to get
the status of the drain node process.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to get the status of the drain node process for. |
| `nodeName` | `string` | The node name to get the status of the drain node process for. |

## Returns

`Promise`\<`DrainNodeStatus`\>

- The response from the API. @todo: what response?

## Throws

if the request fails

## Throws

if the response is not ok

## Defined in

[src/lib/k8s/api/v1/drainNode.ts:77](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/drainNode.ts#L77)
