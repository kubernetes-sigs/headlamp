# Function: gatewayL4RouteAvailability()

```ts
function gatewayL4RouteAvailability(selectedClusters: string[]): Promise<("TCPRoute" | "UDPRoute")[]>;
```

Defined in: [lib/k8s/gatewayL4RouteAvailability.ts:59](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gatewayL4RouteAvailability.ts#L59)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `selectedClusters` | `string`[] |

## Returns

`Promise`\<(`"TCPRoute"` \| `"UDPRoute"`)[]\>
