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

import { Theme } from '@mui/material/styles';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import Typography, { TypographyProps } from '@mui/material/Typography';
import { SxProps } from '@mui/system';
import React, { ReactNode } from 'react';
import { useId } from '../../lib/util';

/**
 * Represents a single tab with a label and its corresponding content.
 */
export interface Tab {
  /** The display label for the tab. */
  label: string;
  /** The React component to render when the tab is active. */
  component: ReactNode;
}

/**
 * Props for the `Tabs` component.
 */
export interface TabsProps {
  /** Array of tabs to display, each containing a label and component. */
  tabs: Tab[];
  /** Additional props to pass to the underlying Material-UI Tabs component. */
  tabProps?: {
    [propName: string]: any;
  };
  /**
   * The index of the initially active tab. Defaults to 0.
   * Set to null or false to disable initial selection.
   * true is kept for backward compatibility and is treated as an invalid value.
   */
  defaultIndex?: number | null | boolean;
  /** Callback invoked when the active tab changes.
   * @param tabIndex - The index of the newly selected tab.
   */
  onTabChanged?: (tabIndex: number) => void;
  /** Styling for the Tabs component using Material-UI's sx prop. */
  sx?: SxProps<Theme>;
  /** ARIA label for accessibility, describing the purpose of the tab group. */
  ariaLabel: string;
}

/**
 * Normalize defaultIndex to a value MUI Tabs accepts (number | false).
 * null/false mean no selection; non-finite numbers and unsupported values fall back to 0.
 */
function normalizeTabIndex(defaultIndex: TabsProps['defaultIndex']): number | false {
  if (typeof defaultIndex === 'number') {
    return Number.isFinite(defaultIndex) ? Math.max(defaultIndex, 0) : 0;
  }
  if (defaultIndex === null || defaultIndex === false) {
    return false;
  }
  return 0;
}

/**
 * A scrollable tab navigation component using Material UI,
 * with support for default tab selection, custom styles,
 * and dynamic content rendering.
 *
 * @param props - The properties to configure the Tabs component.
 * @returns A tabbed interface with selectable content panels.
 */
export default function Tabs(props: TabsProps) {
  const { tabs, tabProps = {}, defaultIndex = 0, onTabChanged = null, ariaLabel } = props;
  // Math.max keeps non-negative indices; Math.min(..., 0) clamped positive indices to 0 (#6409).
  // Normalize null/false to false so MUI never sees value={null} on the first render.
  const [tabIndex, setTabIndex] = React.useState<number | false>(() =>
    normalizeTabIndex(defaultIndex)
  );

  /**
   * Handles tab change events.
   *
   * @param event - The event triggered by selecting a new tab.
   * @param newValue - The index of the newly selected tab.
   */
  function handleTabChange(event: any, newValue: number) {
    setTabIndex(newValue);

    if (onTabChanged !== null) {
      onTabChanged(newValue);
    }
  }

  React.useEffect(() => {
    setTabIndex(normalizeTabIndex(defaultIndex));
  }, [defaultIndex]);

  const uniqueIdSuffix = useId('tabs-');

  return (
    <React.Fragment>
      <MuiTabs
        value={tabIndex}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        aria-label={ariaLabel}
        variant="scrollable"
        centered={false}
        scrollButtons="auto"
        sx={props.sx}
        {...tabProps}
      >
        {tabs.map(({ label }, i) => (
          <MuiTab
            key={i}
            label={label}
            tabIndex={0}
            sx={
              tabs?.length > 7
                ? {
                    minWidth: 150, // allows 8 tabs to show like on pods
                  }
                : {}
            }
            id={`full-width-tab-${i}-${ariaLabel.replace(' ', '')}-${uniqueIdSuffix}`}
            aria-controls={`full-width-tabpanel-${i}-${ariaLabel.replace(
              ' ',
              ''
            )}-${uniqueIdSuffix}`}
          />
        ))}
      </MuiTabs>
      {tabs.map(({ component }, i) => (
        <TabPanel
          key={i}
          activeTabIndex={tabIndex}
          index={i}
          id={`full-width-tabpanel-${i}-${ariaLabel.replace(' ', '')}-${uniqueIdSuffix}`}
          labeledBy={`full-width-tab-${i}-${ariaLabel.replace(' ', '')}-${uniqueIdSuffix}`}
        >
          {component}
        </TabPanel>
      ))}
    </React.Fragment>
  );
}

/**
 * Props for a single tab panel.
 */
interface TabPanelProps extends Omit<TypographyProps, 'tabIndex'> {
  /** The index of the currently active tab. Preferred over tabIndex when both are provided. */
  activeTabIndex?: number | false;
  /** @deprecated Use activeTabIndex instead. */
  tabIndex?: number | false;
  /** The index of this tab panel. */
  index: number;
  /** The unique ID for the tab panel, used for accessibility. */
  id: string;
  /** The ID of the tab that controls this panel, used for accessibility. */
  labeledBy: string;
}

/**
 * Renders a panel for the currently active tab.
 *
 * @param props - The properties of the tab panel.
 * @returns A container showing the content if this panel is active.
 */
export function TabPanel(props: TabPanelProps) {
  const { children, activeTabIndex, tabIndex, index, id, labeledBy } = props;
  const selectedTabIndex = activeTabIndex ?? tabIndex ?? 0;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={selectedTabIndex !== index}
      id={id}
      aria-labelledby={labeledBy}
      tabIndex={selectedTabIndex === index ? 0 : -1}
      sx={{ flexGrow: 1, overflow: 'hidden' }}
    >
      {children}
    </Typography>
  );
}
