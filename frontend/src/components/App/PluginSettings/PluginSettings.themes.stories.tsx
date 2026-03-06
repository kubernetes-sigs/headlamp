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
import { ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import { AppTheme } from '../../../lib/AppTheme';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo } from '../../../plugin/pluginsSlice';
import { TestContext } from '../../../test';
import defaultAppThemes from '../defaultAppThemes';
import { PluginSettingsPure } from './PluginSettings';

export default {
  title: 'Settings/PluginSettings/Themes',
  component: PluginSettingsPure,
} as Meta;

const plugins: PluginInfo[] = [
  {
    name: 'user-plugin-example',
    description: 'An example of a user-installed plugin',
    type: 'user',
    isEnabled: true,
    isCompatible: true,
    isLoaded: true,
    homepage: 'https://example.com/user-plugin',
    origin: 'User',
  },
  {
    name: 'dev-plugin-example',
    description: 'An example of a development plugin',
    type: 'development',
    isEnabled: true,
    isCompatible: true,
    isLoaded: true,
    homepage: 'https://example.com/dev-plugin',
    origin: 'Dev',
  },
  {
    name: 'shipped-plugin-example',
    description: 'An example of a shipped plugin',
    type: 'shipped',
    isEnabled: true,
    isCompatible: true,
    isLoaded: true,
    homepage: 'https://example.com/shipped-plugin',
    origin: 'Headlamp',
  },
];

export const AllThemes: StoryFn = () => (
  <TestContext>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 2 }}>
      <Typography variant="h4" gutterBottom>
        Theme Verification
      </Typography>
      <Typography variant="body1" gutterBottom>
        This story renders the PluginSettings component with each of the default application themes.
        Use this to verify the contrast of the "User-installed" chips and other UI elements.
      </Typography>

      {defaultAppThemes.map((theme: AppTheme) => {
        const muiTheme = createMuiTheme(theme);
        return (
          <Box
            key={theme.name}
            sx={{
              border: '1px solid #ccc',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 1, bgcolor: '#eee', borderBottom: '1px solid #ccc' }}>
              <Typography variant="subtitle1" component="div" sx={{ color: '#333' }}>
                Theme: <strong>{theme.name}</strong> ({theme.base || 'light'})
              </Typography>
            </Box>
            <ThemeProvider theme={muiTheme}>
              <Box
                sx={{
                  bgcolor: 'background.default',
                  color: 'text.primary',
                  p: 2,
                }}
              >
                <PluginSettingsPure plugins={plugins as any} onSave={() => {}} />
              </Box>
            </ThemeProvider>
          </Box>
        );
      })}
    </Box>
  </TestContext>
);
