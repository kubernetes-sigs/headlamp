# Function: gatewayL4RouteAvailability()

```ts
function gatewayL4RouteAvailability(selectedClusters: string[]): Promise<("TCPRoute" | "UDPRoute")[]>;
```

Defined in: [lib/k8s/gatewayL4RouteAvailability.ts:59](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gatewayL4RouteAvailability.ts#L59)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `selectedClusters` | `string`[] |

## Returns

`Promise`\<(`"TCPRoute"` \| `"UDPRoute"`)[]\>
