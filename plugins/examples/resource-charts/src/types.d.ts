declare module '@mui/material' {
  import { Theme } from '@mui/material/styles';
  import { ElementType, ReactNode } from 'react';

  export function useTheme(): Theme;

  export interface BoxProps {
    p?: number;
    children?: ReactNode;
  }

  export const Box: ElementType<BoxProps>;
  export const Paper: ElementType;
}

declare module '@mui/material/styles' {
  export interface Theme {
    palette: {
      error: {
        main: string;
      };
      [key: string]: any;
    };
  }
}
