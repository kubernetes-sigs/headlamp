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

import { createTheme } from '@mui/material';
import { green, grey, orange, red } from '@mui/material/colors';

const commonRules = {
  palette: {
    primary: {
      contrastText: '#fff',
      main: '#2774b3',
    },
    primaryColor: '#000',
    success: {
      light: green['50'],
      main: green['800'],
      ...green,
    },
    warning: {
      main: 'rgb(196, 69, 0)', // orange
      light: orange['50'],
      ...orange,
    },
    sidebarLink: {
      main: grey['500'],
      selectedBg: grey['800'],
    },
    error: {
      main: red['800'],
      light: red['50'],
    },
    resourceToolTip: {
      color: 'rgba(0, 0, 0, 0.87)',
    },
    sidebarBg: '#000',
    normalEventBg: '#F0F0F0',
    chartStyles: {
      defaultFillColor: grey['300'],
      labelColor: '#000',
    },
    metadataBgColor: grey['300'],
    headerStyle: {
      normal: {
        fontSize: '1.8rem',
        fontWeight: '700',
      },
      main: {
        fontSize: '1.87rem',
        fontWeight: '700',
      },
      subsection: {
        fontSize: '1.85rem',
        fontWeight: '700',
      },
      label: {
        fontSize: '1.6rem',
        paddingTop: '1rem',
      },
    },
    tables: {
      headerText: '#474747',
    },
  },
  typography: {
    fontFamily: ['Overpass', 'sans-serif'].join(', '),
    h1: {
      fontWeight: 700,
      fontSize: '1.87rem',
    },
  },
  shape: {
    borderRadius: 0,
  },
};

export const theme = createTheme(commonRules);
