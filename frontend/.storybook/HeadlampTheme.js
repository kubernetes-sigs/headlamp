/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
