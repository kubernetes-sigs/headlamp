// https://storybook.js.org/docs/react/configure/theming#create-a-theme-quickstart
//  To workaround a bug at time of writing, where theme is not refreshed,
//  you may need to `npm run storybook --no-manager-cache`
import { create } from 'storybook/theming/create';
import logoUrl from '../../docs/headlamp_light.svg';

// Please also update plugins/headlamp-plugin/config/.storybook/HeadlampTheme.js

export default create({
  base: 'light',
  brandTitle: 'Headlamp Kubernetes Web UI dashboard',
  brandUrl: 'https://headlamp.dev/docs/latest/development/',
  brandImage: logoUrl,
  fontBase: '"Overpass", sans-serif',
  fontCode: '"Overpass Mono", monospace',
});
