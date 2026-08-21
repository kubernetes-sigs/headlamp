# Function: registerHeadlampEventCallback()

```ts
function registerHeadlampEventCallback(callback: HeadlampEventCallback): void;
```

Defined in: [plugin/registry.tsx:777](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L777)

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
