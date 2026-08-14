# Function: registerHeadlampEventCallback()

```ts
function registerHeadlampEventCallback(callback: HeadlampEventCallback): void;
```

Defined in: [plugin/registry.tsx:755](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L755)

Add a callback for headlamp events.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | [`HeadlampEventCallback`](../type-aliases/HeadlampEventCallback.md) | The callback to add. |

## Returns

`void`

## Example

```ts
import {
  DefaultHeadlampEvents,
  registerHeadlampEventCallback,
  HeadlampEvent,
} from '@kinvolk/headlamp-plugin/lib';

registerHeadlampEventCallback((event: HeadlampEvent) => {
  if (event.type === DefaultHeadlampEvents.ERROR_BOUNDARY) {
    console.error('Error:', event.data);
  } else {
    console.log(`Headlamp event of type ${event.type}: ${event.data}`)
  }
});
```
