import { registerAppTheme } from '@kinvolk/headlamp-plugin/lib';

// To see this theme, go into Settings then General and select "my custom theme" from the dropdown
registerAppTheme({
  name: 'my custom theme',
  base: 'light',
  primary: '#414141',
  secondary: '#eff2f5',
  text: {
    primary: '#44444f',
  },
  background: {
    muted: '#f5f5f5',
  },
  sidebar: {
    background: '#f0f0f0',
    color: '#605e5c',
    selectedBackground: '#f2e600',
    selectedColor: '#292827',
    actionBackground: '#414141',
  },
  navbar: {
    background: '#f0f0f0',
    color: '#292827',
  },
  buttonTextTransform: 'none',
  radius: 6,
});
