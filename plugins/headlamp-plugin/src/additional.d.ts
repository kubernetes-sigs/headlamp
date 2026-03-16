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

/// <reference types="node" />
/// <reference types="react" />
/// <reference types="react-dom" />

export interface HeadlampChartStyles {
  defaultFillColor: string;
  fillColor?: string;
  labelColor: string;
}

export interface HeadlampHeaderStyle {
  normal: {
    fontSize: string;
    fontWeight: string;
  };
  main: {
    fontSize: string;
    fontWeight: string;
  };
  subsection: {
    fontSize: string;
    fontWeight: string;
  };
  label: {
    fontSize: string;
    paddingTop: string;
  };
}

export interface HeadlampTables {
  head: {
    background: string;
    color: string;
    borderColor: string;
    text?: string;
  };
  body: {
    background: string;
  };
  headerText?: string;
}

export interface HeadlampHome {
  status: {
    error: string;
    success: string;
    warning: string;
    unknown: string;
  };
}

export interface HeadlampClusterChooser {
  button: {
    color: string;
    background: string;
    hover: {
      background: string;
    };
  };
}

export interface HeadlampSidebarButtonInLinkArea {
  color: string;
  primary: {
    background: string;
  };
  hover: {
    background: string;
  };
}

export interface HeadlampSquareButton {
  background: string;
}

export interface HeadlampResourceToolTip {
  color: string;
}

export interface HeadlampSidebar {
  background: string;
  color: string;
  selectedBackground: string;
  selectedColor: string;
  actionBackground: string;
}

export interface HeadlampNavbar {
  background: string;
  color: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    sidebar: HeadlampSidebar;
    navbar: HeadlampNavbar;
    chartStyles: HeadlampChartStyles;
    headerStyle: HeadlampHeaderStyle;
    tables: HeadlampTables;
    home: HeadlampHome;
    clusterChooser: HeadlampClusterChooser;
    sidebarButtonInLinkArea: HeadlampSidebarButtonInLinkArea;
    squareButton: HeadlampSquareButton;
    resourceToolTip: HeadlampResourceToolTip;
    normalEventBg: string;
    metadataBgColor: string;
    notificationBorderColor: string;
    [propName: string]: any;
  }
  interface PaletteOptions {
    sidebar?: Partial<HeadlampSidebar>;
    navbar?: Partial<HeadlampNavbar>;
    chartStyles?: Partial<HeadlampChartStyles>;
    headerStyle?: Partial<HeadlampHeaderStyle>;
    tables?: Partial<HeadlampTables>;
    home?: Partial<HeadlampHome>;
    clusterChooser?: Partial<HeadlampClusterChooser>;
    sidebarButtonInLinkArea?: Partial<HeadlampSidebarButtonInLinkArea>;
    squareButton?: Partial<HeadlampSquareButton>;
    resourceToolTip?: Partial<HeadlampResourceToolTip>;
    normalEventBg?: string;
    metadataBgColor?: string;
    notificationBorderColor?: string;
    [propName: string]: any;
  }

  interface TypeBackground {
    default: string;
    paper: string;
    muted: string;
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly PUBLIC_URL: string;
  }
}

declare module '*.avif' {
  const src: string;
  export default src;
}

declare module '*.bmp' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
  export default content;
}
