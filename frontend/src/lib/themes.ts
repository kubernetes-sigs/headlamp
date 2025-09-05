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

import { green, grey, orange, pink, red } from '@mui/material/colors';
import { createTheme, getContrastRatio, useTheme } from '@mui/material/styles';
import React from 'react';
import { AppTheme } from './AppTheme';

declare module '@mui/material/styles/createPalette.d' {
  interface Palette {
    success: PaletteColor;
    background: TypeBackground;
    sidebar: {
      background: string;
      color: string;
      selectedBackground: string;
      selectedColor: string;
      actionBackground: string;
    };
    navbar: {
      background: string;
      color: string;
    };
    [propName: string]: any;
  }
  interface PaletteOptions {
    success?: PaletteColorOptions;
    [propName: string]: any;
  }

  interface TypeBackground {
    default: string;
    paper: string;
    muted: string;
  }
}

/** Check whether navbar should use light or dark mode based on the background */
export const useNavBarMode = () => {
  const theme = useTheme();

  return getContrastRatio(theme.palette.navbar.background, '#FFF') > 3 ? 'dark' : 'light';
};

/**
 * Creates a Material UI theme from our own simple theme definition
 */
export function createMuiTheme(currentTheme: AppTheme) {
  const commonRules = {
    // @todo: Remove this once we have tested and fixed the theme for the new breakpoints.
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
      },
    },
    mixins: {
      toolbar: {
        minHeight: 64,
        '@media (max-width:600px)': {
          minHeight: 60,
        },
      },
    },
    palette: {
      text: {
        primary: currentTheme.text?.primary ?? 'rgba(0, 0, 0, 0.87)',
      },
      primary: {
        main: currentTheme.primary ?? '#0078d4',
      },
      secondary: currentTheme.secondary
        ? { main: currentTheme.secondary, contrastText: '#000' }
        : {
            light: pink.A200,
            main: pink.A400,
            dark: pink.A700,
          },
      success: {
        light: '#f8fff0',
        main: green['800'],
        ...green,
      },
      warning: {
        main: 'rgb(196, 69, 0)', // orange
        light: orange['50'],
        ...orange,
      },
      squareButton: {
        background: '#f5f5f5',
      },
      sidebar: {
        background: currentTheme.sidebar?.background ?? '#FFF',
        color: currentTheme.sidebar?.color ?? '#333',
        selectedBackground: currentTheme.sidebar?.selectedBackground ?? '#59636e',
        selectedColor: currentTheme.sidebar?.selectedColor ?? '#59636e',
        actionBackground: currentTheme.sidebar?.actionBackground ?? '#333',
      },
      navbar: {
        background: currentTheme.navbar?.background ?? '#FFF',
        color: currentTheme.navbar?.color ?? '#333',
      },
      clusterChooser: {
        button: {
          color: '#fff',
          background: '#000',
          hover: {
            background: '#605e5c',
          },
        },
      },
      sidebarButtonInLinkArea: {
        color: '#fff',
        primary: {
          background: '#605e5c',
        },
        hover: {
          background: '#3B3A39',
        },
      },
      home: {
        status: {
          error: red['800'],
          success: '#107C10',
          warning: orange['50'],
          unknown: grey['800'],
        },
      },
      error: {
        main: red['800'],
        light: red['50'],
      },
      resourceToolTip: {
        color: 'rgba(0, 0, 0, 0.87)',
      },
      normalEventBg: '#F0F0F0',
      chartStyles: {
        defaultFillColor: grey['300'],
        labelColor: '#000',
      },
      metadataBgColor: '#f3f2f1',
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
        head: {
          background: '#faf9f8',
          color: '#242424',
          borderColor: 'rgba(0,0,0,0.12)',
        },
        body: {
          background: '#fff',
        },
      },
      notificationBorderColor: 'rgba(0,0,0,0.12)',
      background: {
        default: currentTheme.background?.default ?? '#fff',
        paper: currentTheme.background?.surface ?? '#FFF',
        muted: currentTheme.background?.muted ?? '#faf9f8',
      },
    },
    typography: {
      fontFamily: currentTheme.fontFamily?.join(', ') ?? ['Overpass', 'sans-serif'].join(', '),
      h1: {
        fontWeight: 700,
        fontSize: '1.87rem',
      },
      button: {
        textTransform: currentTheme.buttonTextTransform ?? 'uppercase',
      },
    },
    shape: {
      borderRadius: Number(currentTheme.radius) ?? 4,
    },
    components: {
      MuiPaper: {
        defaultProps: {
          variant: 'outlined' as const,
        },
      },
      MuiDialog: {
        defaultProps: {
          PaperProps: {
            variant: 'outlined' as const,
            elevation: 0,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
      },
      MuiFormControl: {
        defaultProps: {
          variant: 'standard' as 'filled' | 'outlined' | 'standard',
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'standard' as 'filled' | 'outlined' | 'standard',
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '1.3em',
            color: '#fff',
            backgroundColor: '#000',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          colorPrimary: {
            backgroundColor: '#f5f5f5',
          },
        },
      },
      MuiIconButton: {
        defaultProps: {
          size: 'medium' as 'medium' | 'large' | 'small' | undefined,
        },
        styleOverrides: {
          colorPrimary: {
            color: '#000',
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            color: currentTheme.link?.color ?? '#0078D4',
          },
        },
        defaultProps: {
          underline: 'hover' as 'always' | 'hover' | 'none',
        },
      },
    },
  };

  if (currentTheme.base === 'dark') {
    return createTheme({
      ...commonRules,
      palette: {
        ...commonRules.palette,
        tables: {
          head: {
            background: '#000',
            color: '#aeaeae',
            borderColor: 'rgba(255,255,255,0.12)',
          },
          body: {
            background: '#1B1A19',
          },
        },
        text: {
          primary: currentTheme.text?.primary ?? '#fff',
        },
        primary: {
          main: currentTheme.primary ?? '#4B99EE',
        },
        secondary: {
          main: currentTheme.secondary ?? commonRules.palette.secondary.main,
        },
        squareButton: {
          background: '#424242',
        },
        chartStyles: {
          defaultFillColor: 'rgba(20, 20, 20, 0.1)',
          fillColor: '#929191',
          labelColor: '#fff',
        },
        success: {
          light: green['800'],
          main: green['50'],
          ...green,
        },
        warning: {
          main: 'rgb(255 181 104)', // orange
          light: 'rgba(255, 152, 0, 0.15)',
          ...orange,
        },
        error: {
          main: red['800'],
          light: red['300'],
          ...red,
        },
        home: {
          status: {
            error: '#E37D80',
            success: '#54B054',
            warning: '#FEEE66',
            unknown: '#D6D6D6',
          },
        },
        normalEventBg: '#333333',
        metadataBgColor: '#333',
        resourceToolTip: {
          color: 'rgba(255, 255, 255, 0.87)',
        },
        clusterChooser: {
          button: {
            color: '#fff',
            background: '#605e5c',

            hover: {
              background: '#3B3A39',
            },
          },
        },
        notificationBorderColor: 'rgba(255,255,255,0.12)',
        mode: 'dark',
        background: {
          default: currentTheme.background?.default ?? '#1f1f1f',
          paper: currentTheme.background?.surface ?? '#1f1f1f',
          muted: currentTheme.background?.muted ?? '#1B1A19',
        },
      },
      components: {
        ...commonRules.components,
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              ...commonRules.components.MuiTooltip.styleOverrides.tooltip,
              backgroundColor: '#000',
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              colorPrimary: {
                backgroundColor: '#000',
              },
            },
          },
        },
        MuiIconButton: {
          defaultProps: {
            size: 'medium' as 'medium' | 'large' | 'small' | undefined,
          },
          styleOverrides: {
            colorPrimary: {
              color: '#fff',
            },
          },
        },
        MuiLink: {
          styleOverrides: {
            root: {
              color: '#6CB6F2',
            },
          },
          defaultProps: {
            underline: 'hover' as 'always' | 'hover' | 'none',
          },
        },
        MuiSwitch: {
          styleOverrides: {
            root: {
              colorPrimary: {
                '&&.Mui-checked': {
                  color: '#4b99ee',
                },
              },
            },
          },
        },
        MuiTab: {
          styleOverrides: {
            textColorPrimary: {
              '&&.Mui-selected': {
                color: '#fff',
                borderBottomColor: '#fff',
              },
            },
          },
        },
        MuiTabs: {
          styleOverrides: {
            root: {
              indicator: {
                backgroundColor: '#fff',
              },
            },
          },
        },
      },
    });
  }

  return createTheme(commonRules);
}

export function usePrefersColorScheme() {
  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const [value, setValue] = React.useState(mql.matches);

  React.useEffect(() => {
    const handler = (x: MediaQueryListEvent | MediaQueryList) => setValue(x.matches);
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return value;
}

/**
 * Hook gets theme based on user preference, and also OS/Browser preference.
 */
export function getThemeName(): string {
  const themePreference = localStorage.headlampThemePreference;

  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

  let themeName = 'light';
  if (themePreference) {
    // A selected theme preference takes precedence.
    themeName = themePreference;
  } else {
    if (prefersLight) {
      themeName = 'light';
    } else if (prefersDark) {
      themeName = 'dark';
    }
  }

  return themeName;
}

export function setTheme(themeName: string) {
  localStorage.headlampThemePreference = themeName;
}
