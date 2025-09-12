import { addons } from 'storybook/manager-api';
import theme from './HeadlampTheme';

// Please also update: plugins/headlamp-plugin/config/.storybook/manager.js

addons.setConfig({
  theme: theme,
});
