// https://storybook.js.org/docs/react/configure/theming#create-a-theme-quickstart
//  To workaround a bug at time of writing, where theme is not refreshed,
//  you may need to `npm run storybook --no-manager-cache`
import { create } from 'storybook/theming/create';

export default create({
  base: 'light',
  brandTitle: 'Headlamp plugin storybook',
  brandUrl: 'https://headlamp.dev/docs/latest/development/plugins/functionality/#functionality',
});
