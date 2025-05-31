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
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Meta, StoryFn } from '@storybook/react';
import { I18nextProvider } from 'react-i18next';
import i18next from '../../../i18n/config';
import LayoutForStories from './LayoutForStories';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

export default {
  title: 'App/Layout',
  component: LayoutForStories,
  parameters: {
    layout: 'fullscreen',
    // Disable default padding/margin in storybook
    backgrounds: {
      default: 'light',
    },
    docs: {
      description: {
        component:
          'Main layout component for Headlamp application. Controls the overall page structure including sidebar, top bar, and main content area.',
      },
    },
  },
  decorators: [
    Story => (
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18next}>
          <Story />
        </I18nextProvider>
      </ThemeProvider>
    ),
  ],
  argTypes: {
    showSidebar: {
      control: 'boolean',
      description: 'Controls visibility of the sidebar',
      defaultValue: true,
    },
    isFullWidth: {
      control: 'boolean',
      description: 'When true, the content area takes full width without padding',
      defaultValue: false,
    },
    showErrorState: {
      control: 'boolean',
      description: 'Shows error notification for cluster issues',
      defaultValue: false,
    },
    children: {
      control: 'text',
      description: 'Content to render in the main area',
    },
    customPanelElements: {
      control: 'object',
      description: 'Additional UI elements to render in various panel positions',
    },
  },
} as Meta<typeof LayoutForStories>;

const Template: StoryFn<typeof LayoutForStories> = args => <LayoutForStories {...args} />;

export const Default = Template.bind({});
Default.args = {};
Default.parameters = {
  docs: {
    description: {
      story: 'Default layout configuration with sidebar visible.',
    },
  },
};

export const WithoutSidebar = Template.bind({});
WithoutSidebar.args = {
  showSidebar: false,
};
WithoutSidebar.parameters = {
  docs: {
    description: {
      story: 'Layout with sidebar hidden, providing more space for content.',
    },
  },
};

export const FullWidth = Template.bind({});
FullWidth.args = {
  isFullWidth: true,
};
FullWidth.parameters = {
  docs: {
    description: {
      story: 'Full width layout without container padding, useful for data-heavy views.',
    },
  },
};

export const WithErrorState = Template.bind({});
WithErrorState.args = {
  showErrorState: true,
};
WithErrorState.parameters = {
  docs: {
    description: {
      story: 'Layout showing cluster error notification banner.',
    },
  },
};

export const WithCustomContent = Template.bind({});
WithCustomContent.args = {
  children: (
    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, m: 2 }}>
      <h2>Custom Content</h2>
      <p>This demonstrates the layout with custom content in the main area.</p>
      <Box sx={{ height: '500px', bgcolor: 'action.hover', p: 2, mt: 2 }}>
        <p>Scrollable content area</p>
        <div style={{ marginTop: '400px' }}>
          <p>Content at bottom to demonstrate scrolling behavior</p>
        </div>
      </Box>
    </Box>
  ),
};
WithCustomContent.parameters = {
  docs: {
    description: {
      story: 'Layout with custom content showing scrolling behavior.',
    },
  },
};

export const WithTopNotification = Template.bind({});
WithTopNotification.args = {
  customPanelElements: {
    top: [
      <Box
        key="notification"
        sx={{
          bgcolor: 'warning.main',
          p: 1,
          textAlign: 'center',
          color: 'warning.contrastText',
          width: '100%',
        }}
      >
        System maintenance scheduled for tomorrow
      </Box>,
    ],
  },
};
WithTopNotification.parameters = {
  docs: {
    description: {
      story: 'Layout with a notification banner above the top bar.',
    },
  },
};

export const WithRightPanel = Template.bind({});
WithRightPanel.args = {
  customPanelElements: {
    right: [
      <Box
        key="sidebar"
        sx={{
          width: '300px',
          bgcolor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider',
          height: '100%',
          p: 2,
        }}
      >
        <h3>Details Panel</h3>
        <p>Additional information or controls can be shown here.</p>
      </Box>,
    ],
  },
};
WithRightPanel.parameters = {
  docs: {
    description: {
      story: 'Layout with an additional panel on the right side.',
    },
  },
};

export const WithMultiplePanels = Template.bind({});
WithMultiplePanels.args = {
  isFullWidth: true,
  customPanelElements: {
    top: [
      <Box
        key="banner"
        sx={{
          bgcolor: 'info.main',
          color: 'info.contrastText',
          p: 1,
          textAlign: 'center',
          width: '100%',
        }}
      >
        Welcome to the dashboard
      </Box>,
    ],
    left: [
      <Box
        key="leftPanel"
        sx={{
          width: '200px',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          p: 2,
        }}
      >
        <h3>Custom Left Panel</h3>
        <Box sx={{ height: '40px', bgcolor: 'action.selected', mb: 1, borderRadius: 1 }} />
        <Box sx={{ height: '40px', bgcolor: 'action.hover', mb: 1, borderRadius: 1 }} />
      </Box>,
    ],
    bottom: [
      <Box
        key="footer"
        sx={{
          bgcolor: 'background.paper',
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          textAlign: 'center',
          width: '100%',
        }}
      >
        Footer content here
      </Box>,
    ],
  },
};
WithMultiplePanels.parameters = {
  docs: {
    description: {
      story: 'Layout with multiple custom panels, showing complex layout capabilities.',
    },
  },
};
