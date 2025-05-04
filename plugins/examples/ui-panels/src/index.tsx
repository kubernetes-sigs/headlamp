import { registerUIPanel } from '@kinvolk/headlamp-plugin/lib';

/**
 * UI Panel is an element you can add to the sides of the Headlamp UI
 */

registerUIPanel({
  id: 'top-panel',
  side: 'top',
  component: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Top Panel
    </div>
  ),
});

registerUIPanel({
  id: 'bottom-panel',
  side: 'bottom',
  component: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Bottom Panel
    </div>
  ),
});

registerUIPanel({
  id: 'left-panel',
  side: 'left',
  component: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Left Panel
    </div>
  ),
});

registerUIPanel({
  id: 'right-panel',
  side: 'right',
  component: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '50px',
        flexShrink: 0,
        border: '1px solid green',
      }}
    >
      Right Panel
    </div>
  ),
});
