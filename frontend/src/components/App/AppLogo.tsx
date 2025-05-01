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

import { Theme } from '@mui/material';
import { SxProps } from '@mui/system';
import React, { isValidElement, ReactElement } from 'react';
import { getThemeName, useNavBarMode } from '../../lib/themes';
import { useTypedSelector } from '../../redux/reducers/reducers';
import LogoDark from '../../resources/icon-dark.svg?react';
import LogoLight from '../../resources/icon-light.svg?react';
import LogoWithTextDark from '../../resources/logo-dark.svg?react';
import LogoWithTextLight from '../../resources/logo-light.svg?react';
import { EmptyContent } from '../common';
import ErrorBoundary from '../common/ErrorBoundary';

export interface AppLogoProps {
  /** The size of the logo. 'small' for in mobile view, and 'large' for tablet and desktop sizes. By default the 'large' is used. */
  logoType?: 'small' | 'large';
  /** User selected theme. By default it checks which is is active. */
  themeName?: string;
  /** A class to use on your SVG. */
  className?: string;
  /** SxProps to use on your SVG. */
  sx?: SxProps<Theme>;
  [key: string]: any;
}

export type AppLogoType =
  | React.ComponentType<AppLogoProps>
  | ReactElement
  | typeof React.Component
  | null;

export default function OriginalAppLogo(props: AppLogoProps) {
  const { logoType, themeName } = props;

  const Component =
    logoType === 'large'
      ? themeName === 'dark'
        ? LogoWithTextLight
        : LogoWithTextDark
      : themeName === 'dark'
      ? LogoLight
      : LogoDark;

  return <Component style={{ width: 'auto', height: '32px' }} />;
}

export function AppLogo(props: AppLogoProps) {
  const { logoType = 'large', themeName = getThemeName() } = props;
  const arePluginsLoaded = useTypedSelector(state => state.plugins.loaded);
  const PluginAppLogoComponent = useTypedSelector(state => state.theme.logo);
  const PluginAppLogoComp = PluginAppLogoComponent as typeof React.Component;
  const mode = useNavBarMode();

  // Till all plugins are not loaded show empty content for logo as we might have logo coming from a plugin
  if (!arePluginsLoaded) {
    return <EmptyContent />;
  }

  return PluginAppLogoComponent ? (
    <ErrorBoundary>
      {isValidElement(PluginAppLogoComponent) ? (
        // If it's an element, just use it.
        PluginAppLogoComponent
      ) : (
        // It is a component, so we make it here.
        <PluginAppLogoComp
          logoType={logoType}
          themeName={themeName}
          sx={{ height: '32px', width: 'auto' }}
        />
      )}
    </ErrorBoundary>
  ) : (
    <OriginalAppLogo logoType={logoType} themeName={mode} />
  );
}
