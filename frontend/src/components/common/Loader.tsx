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

import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import React from 'react';

/**
 * - Uses CSS animations so does not freeze when main thread is busy
 * - Does not display right away, to avoid flash of spinner
 */

export interface LoaderProps {
  /** If true, the loader will not be wrapped in a container Box. */
  noContainer?: boolean;
  /** Title for the loader, used for accessibility and as a tooltip. */
  title: string;
  /** Size of the loader. Defaults to 40. */
  size?: number;
  /** Color of the loader. Defaults to primary color. */
  color?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' | string;
}

/**
 * Injects custom loader styles into the document, once for each theme.
 */
function injectLoaderStyle(theme: any) {
  const styleId = `hl-custom-loader-style-${theme.palette.primary.main.replace(
    /[^a-zA-Z0-9]/g,
    ''
  )}`;
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes hl-custom-loader-spin {
        100% { transform: rotate(360deg); }
      }
      @keyframes hl-custom-loader-delay {
        0% { opacity: 0; }
        99% { opacity: 0; }
        100% { opacity: 1; }
      }
      .hl-custom-loader {
        display: inline-block;
        position: relative;
        opacity: 0;
        animation: hl-custom-loader-delay 0.25s linear forwards;
      }
      .hl-custom-loader-circle {
        box-sizing: border-box;
        position: absolute;
        top: 0; left: 0;
        border-radius: 50%;
        border-right-color: transparent;
        border-bottom-color: transparent;
        animation: hl-custom-loader-spin 0.8s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes hl-custom-loader-spin-reduced {
          0%   { transform: rotate(0deg); }
          13%  { transform: rotate(0deg); }
          23%  { transform: rotate(90deg); }
          36%  { transform: rotate(90deg); }
          46%  { transform: rotate(180deg); }
          59%  { transform: rotate(180deg); }
          69%  { transform: rotate(270deg); }
          82%  { transform: rotate(270deg); }
          92%  { transform: rotate(360deg); }
          100% { transform: rotate(360deg); }
        }
        .hl-custom-loader-circle {
          animation: hl-custom-loader-spin-reduced 8s linear infinite;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * @returns a color value based on the theme and the provided color prop.
 * If no color is provided, it defaults to the primary color of the theme.
 */
function getColor(theme: any, color?: LoaderProps['color']) {
  if (!color || color === 'primary') return theme.palette.primary.main;
  if (color === 'secondary') return theme.palette.secondary.main;
  if (color === 'error') return theme.palette.error.main;
  if (color === 'info') return theme.palette.info.main;
  if (color === 'success') return theme.palette.success.main;
  if (color === 'warning') return theme.palette.warning.main;
  return color;
}

/**
 * @returns a MUI class name based on the provided color prop.
 * This is used to apply the correct color to the CircularProgress component.
 */
function getMuiColorClass(color?: LoaderProps['color']) {
  if (!color || color === 'primary') return 'MuiCircularProgress-colorPrimary';
  if (color === 'secondary') return 'MuiCircularProgress-colorSecondary';
  if (color === 'error') return 'MuiCircularProgress-colorError';
  if (color === 'info') return 'MuiCircularProgress-colorInfo';
  if (color === 'success') return 'MuiCircularProgress-colorSuccess';
  if (color === 'warning') return 'MuiCircularProgress-colorWarning';
  return '';
}

/**
 * Gets the color with supplied opacity.
 * If the color is 'inherit' or 'currentColor', it returns null.
 */
function withOpacity(color: string, opacity = 0.5) {
  if (!color) return null;
  if (color === 'inherit' || color === 'currentColor') return null;
  return alpha(color, opacity);
}

/**
 * CustomLoader component that renders a circular loader with custom styles.
 */
function CustomLoader({
  title,
  size = 40,
  color,
}: {
  title: LoaderProps['title'];
  size?: LoaderProps['size'];
  color?: LoaderProps['color'];
}) {
  const theme = useTheme();
  React.useEffect(() => {
    injectLoaderStyle(theme);
  }, [theme]);
  const loaderColor = getColor(theme, color);
  const muiColorClass = getMuiColorClass(color);
  let fadedLoaderColor = React.useMemo(() => withOpacity(loaderColor, 0.1), [loaderColor, theme]);
  if (!fadedLoaderColor) {
    fadedLoaderColor = 'transparent';
  }

  return (
    <span
      className={`MuiCircularProgress-root MuiCircularProgress-indeterminate hl-custom-loader ${muiColorClass}`}
      role="status"
      aria-label={title}
      aria-live="polite"
      title={title}
      style={{ width: size, height: size }}
    >
      <span
        className="hl-custom-loader-circle"
        style={{
          width: '100%',
          height: '100%',
          borderWidth: Math.max(2, Math.round(size / 10)),
          borderStyle: 'solid',
          borderColor: `${loaderColor} ${fadedLoaderColor} ${fadedLoaderColor} ${fadedLoaderColor}`,
        }}
      />
    </span>
  );
}

export default function Loader(props: LoaderProps) {
  const { noContainer = false, title, size, color } = props;
  const progress = <CustomLoader title={title} size={size} color={color} />;

  if (noContainer) return progress;

  return (
    <Box sx={{ textAlign: 'center' }} py={3} px="auto">
      {progress}
    </Box>
  );
}
