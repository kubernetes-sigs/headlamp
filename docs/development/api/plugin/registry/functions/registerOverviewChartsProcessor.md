# Function: registerOverviewChartsProcessor()

```ts
function registerOverviewChartsProcessor(processor: OverviewChartsProcessor): void;
```

Defined in: [plugin/registry.tsx:852](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L852)

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
