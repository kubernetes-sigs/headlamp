# Function: registerOverviewChartsProcessor()

```ts
function registerOverviewChartsProcessor(processor: OverviewChartsProcessor): void;
```

Defined in: [plugin/registry.tsx:830](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L830)

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
