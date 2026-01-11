# Function: listPortForward()

```ts
function listPortForward(cluster: string): Promise<PortForward[]>
```

Lists the port forwards for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to list the port forwards. |

## Returns

`Promise`\<[`PortForward`](../interfaces/PortForward.md)[]\>

the list of port forwards for the cluster.

## Defined in

[src/lib/k8s/api/v1/portForward.ts:175](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/portForward.ts#L175)
