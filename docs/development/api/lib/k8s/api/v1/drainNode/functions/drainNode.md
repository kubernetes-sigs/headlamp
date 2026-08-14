# Function: drainNode()

```ts
function drainNode(cluster: string, nodeName: string): Promise<any>;
```

Defined in: [lib/k8s/api/v1/drainNode.ts:36](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/drainNode.ts#L36)

Drain a node

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to drain the node |
| `nodeName` | `string` | The node name to drain |

## Returns

`Promise`\<`any`\>

## Throws

if the request fails

## Throws

if the response is not ok

This function is used to drain a node. It is used in the node detail page.
As draining a node is a long running process, we get the request received
message if the request is successful. And then we poll the drain node status endpoint
to get the status of the drain node process.
