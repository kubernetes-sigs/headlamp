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

// If you just want a text logo, these two lines are all you need.
//
// import { registerAppLogo } from '@kinvolk/headlamp-plugin/lib';
// registerAppLogo(() => <p>My Logo</p>);

import {
  AppLogoProps,
  registerAppLogo,
  registerPluginSettings,
} from '@kinvolk/headlamp-plugin/lib';
import { Avatar, SvgIcon } from '@mui/material';
import LogoWithTextLight from './icon-large-light.svg';
import LogoLight from './icon-small-light.svg';
import Settings, { store } from './settings';
/**
 * A simple logo using two different SVG files.
 * One for the small logo (used in mobile view), and a larger one used in desktop view.
 *
 * The main benefit of a SVG logo is that
 * it's easier to make it look good with light and dark themes.
 */
function SimpleLogo(props: AppLogoProps) {
  const { logoType, className, sx } = props;

  const useConf = store.useConfig();
  const config = useConf();

  return config?.url ? (
    <Avatar src={config?.url} alt="logo" className={className} sx={sx} />
  ) : (
    <SvgIcon
      className={className}
      component={logoType === 'large' ? LogoWithTextLight : LogoLight}
      viewBox="0 0 auto 32"
      sx={sx}
    />
  );
}

/**
 * This logo example shows how you can customize the logo more for different conditions.
 */
export function ReactiveLogo(props: AppLogoProps) {
  const { logoType, themeName } = props;

  if (logoType === 'small' && themeName === 'dark') {
    // Dark mode theme, has a dark background.
    // Small logo is shown on mobile view.
    return <p>small dark theme logo</p>;
  } else if (logoType === 'small' && themeName === 'light') {
    // Light mode theme, has a light background.
    return <p>small light theme logo</p>;
  } else if (logoType === 'large' && themeName === 'dark') {
    // The large logo is shown on tablet and desktop views.
    return <p>large dark theme logo</p>;
  } else if (logoType === 'large' && themeName === 'light') {
    return <p>large light theme logo</p>;
  }
}

const show = 'simple';
if (show === 'simple') {
  registerAppLogo(SimpleLogo);
} else if (show === 'text') {
  registerAppLogo(<p>My Logo</p>);
} else {
  registerAppLogo(ReactiveLogo);
}

/**
 * Register the settings component for the plugin.
 *
 * In this example, the settings component allows users to update the logo URL.
 * The updated URL is automatically saved to the configStore.
 */

registerPluginSettings('change-logo', Settings, false);
