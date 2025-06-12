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

import { AppTheme } from '../../lib/AppTheme';

const headlampClassicLightTheme: AppTheme = {
  name: 'Headlamp Classic',
  primary: '#222',
  secondary: '#eaeaea',
  sidebar: {
    background: '#242424',
    color: '#FFF',
    selectedBackground: '#ebe811',
    selectedColor: '#ebe811',
    actionBackground: '#605e5c',
  },
  navbar: {
    background: '#FFF',
    color: '#202020',
  },
  radius: 4,
};

export const darkTheme: AppTheme = {
  name: 'dark',
  base: 'dark',
  primary: '#ffffff',
  secondary: '#1b1a19',
  text: {
    primary: '#faf9f8',
  },
  background: {
    default: '#292827',
    surface: '#313131',
    muted: '#333333',
  },
  navbar: {
    background: '#252423',
    color: '#faf9f8',
  },
  sidebar: {
    background: '#252423',
    color: '#cdcdcd',
    selectedBackground: '#f2e600',
    selectedColor: '#f2e600',
    actionBackground: '#1b1a19',
  },
  buttonTextTransform: 'none',
  radius: 6,
};

export const lightTheme: AppTheme = {
  name: 'light',
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
};

export const lightsOutTheme: AppTheme = {
  name: 'Lights Out',
  base: 'dark',
  primary: '#1f6feb',
  secondary: '#212830',
  text: {
    primary: '#f0f6fc',
  },
  link: {
    color: '#4493f8',
  },
  background: {
    default: '#010409',
    surface: '#0d1117',
    muted: '#151b23',
  },
  sidebar: {
    background: '#010409',
    color: '#f0f6fc',
    selectedBackground: '#484f57',
    selectedColor: '#fff',
    actionBackground: '#1f6feb',
  },
  navbar: {
    background: '#010409',
    color: '#bdc3c9',
  },
  radius: 6,
  buttonTextTransform: 'none',
};

export const monochromeLightTheme: AppTheme = {
  name: 'Monochrome Light',
  base: 'light',
  primary: '#25292e',
  secondary: '#f6f8fa',
  text: {
    primary: '#1f2328',
  },
  link: {
    color: '#0969da',
  },
  background: {
    default: '#ffffff',
    surface: '#ffffff',
    muted: '#f6f8fa',
  },
  sidebar: {
    background: '#fff',
    color: '#59636e',
    selectedBackground: '#333',
    selectedColor: '#1f2328',
    actionBackground: '#333436',
  },
  navbar: {
    background: '#ffffff',
    color: '#1f2328',
  },
  radius: 6,
  buttonTextTransform: 'none',
};

const defaultAppThemes = [
  lightTheme,
  darkTheme,
  headlampClassicLightTheme,
  lightsOutTheme,
  monochromeLightTheme,
];

export default defaultAppThemes;
