# Function: listPortForward()

```ts
function listPortForward(cluster: string): Promise<PortForward[]>;
```

Defined in: [lib/k8s/api/v1/portForward.ts:170](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/portForward.ts#L170)

Lists the port forwards for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to list the port forwards. |

## Returns

`Promise`\<[`PortForward`](../interfaces/PortForward.md)[]\>

the list of port forwards for the cluster.
