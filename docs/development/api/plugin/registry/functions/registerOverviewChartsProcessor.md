# Function: registerOverviewChartsProcessor()

```ts
function registerOverviewChartsProcessor(processor: OverviewChartsProcessor): void
```

Add a processor for the overview charts section. Allowing the addition or modification of charts.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `processor` | [`OverviewChartsProcessor`](../interfaces/OverviewChartsProcessor.md) | The processor to add. Returns the new charts to be displayed. |

## Returns

`void`

## Example

```tsx
import { registerOverviewChartsProcessor } from '@kinvolk/headlamp-plugin/lib';

registerOverviewChartsProcessor(function addFailedPodsChart(charts) {
  return [
    ...charts,
    {
      id: 'failed-pods',
      component: () => <FailedPodsChart />
    }
  ];
});
```

## Defined in

[src/plugin/registry.tsx:799](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L799)
