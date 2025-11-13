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

import { Meta, StoryFn } from '@storybook/react';
import type { PluginInfo } from '../../../plugin/pluginsSlice';
import { TestContext } from '../../../test';
import { PluginSettingsPure, PluginSettingsPureProps } from './PluginSettings';

export default {
  title: 'Settings/PluginSettings',
  component: PluginSettingsPure,
} as Meta;

const Template: StoryFn<PluginSettingsPureProps> = args => (
  <TestContext>
    <PluginSettingsPure {...args} />
  </TestContext>
);

/**
 * createDemoData function will create example data objects to act as plugin data.
 * The function will return an array of demo data objects based on the number specified.
 */
function createDemoData(arrSize: number, useHomepage?: boolean) {
  /** Static list of plugins */
  const pluginArr: any = [];

  for (let i = 0; i < arrSize; i++) {
    let newPlugin: any = {
      name: `plugin a ${i}`,
      description: `This is a plugin for this project PLUGIN A${i}`,
      isEnabled: i % 2 === 0,
      isCompatible: i % 2 === 0,
      type: 'shipped',
      isLoaded: true,
    };

    if (useHomepage) {
      newPlugin = { ...newPlugin, homepage: `https://example.com/plugin-link-${i}` };
    } else {
      newPlugin = { ...newPlugin, repository: { url: `https://example.com/plugin-link-${i}` } };
    }
    pluginArr.push(newPlugin);
  }

  return pluginArr;
}

/**
 * createPluginsWithMultipleLocations creates example data showing the same plugin
 * installed in different locations (development, user, shipped) with proper priority handling.
 */
function createPluginsWithMultipleLocations(): PluginInfo[] {
  return [
    // Plugin installed in all three locations - development version loads
    {
      name: 'awesome-plugin',
      description: 'An awesome plugin installed in development folder',
      type: 'development' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/awesome-plugin',
    },
    {
      name: 'awesome-plugin',
      description: 'An awesome plugin installed in user folder',
      type: 'user' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: false,
      overriddenBy: 'development' as const,
      homepage: 'https://example.com/awesome-plugin',
    },
    {
      name: 'awesome-plugin',
      description: 'An awesome plugin shipped with Headlamp',
      type: 'shipped' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: false,
      overriddenBy: 'development' as const,
      homepage: 'https://example.com/awesome-plugin',
    },
    // Plugin in user and shipped - user version loads
    {
      name: 'monitoring-plugin',
      description: 'Monitoring plugin installed by user',
      type: 'user' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/monitoring-plugin',
      repository: { url: 'https://github.com/example/monitoring-plugin' },
    },
    {
      name: 'monitoring-plugin',
      description: 'Monitoring plugin shipped with Headlamp',
      type: 'shipped' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: false,
      overriddenBy: 'user' as const,
      homepage: 'https://example.com/monitoring-plugin',
      repository: { url: 'https://github.com/example/monitoring-plugin' },
    },
    // Plugin only in development
    {
      name: 'dev-only-plugin',
      description: 'A plugin only in development folder',
      type: 'development' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/dev-only',
    },
    // Plugin only in user folder
    {
      name: 'custom-plugin',
      description: 'A custom plugin installed by user',
      type: 'user' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/custom-plugin',
      repository: { url: 'https://github.com/example/custom-plugin' },
    },
    // Plugin only shipped
    {
      name: 'default-plugin',
      description: 'A default plugin shipped with Headlamp',
      type: 'shipped' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://headlamp.dev/plugins/default',
    },
    // Disabled development plugin - user version loads instead
    {
      name: 'flexible-plugin',
      description: 'Flexible plugin in development (disabled)',
      type: 'development' as const,
      isEnabled: false,
      isCompatible: true,
      isLoaded: false,
      homepage: 'https://example.com/flexible-plugin',
    },
    {
      name: 'flexible-plugin',
      description: 'Flexible plugin installed by user',
      type: 'user' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/flexible-plugin',
    },
    {
      name: 'flexible-plugin',
      description: 'Flexible plugin shipped with Headlamp',
      type: 'shipped' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: false,
      overriddenBy: 'user' as const,
      homepage: 'https://example.com/flexible-plugin',
    },
  ];
}

/**
 * Creation of data arrays ranging from 0 to 50 to demo state of empty, few, many, and large numbers of data objects.
 * NOTE: The numbers used are up to the users preference.
 */
const demoFew = createDemoData(5);
const demoFewSaveEnable = createDemoData(5);
const demoMany = createDemoData(15);
const demoMore = createDemoData(50);
const demoHomepageEmpty = createDemoData(5, false);
const demoEmpty = createDemoData(0);

/** NOTE: Use console inspect to track console log messages. */
export const FewItems = Template.bind({});
FewItems.args = {
  plugins: demoFew,
  onSave: plugins => {
    console.log('demo few', plugins);
  },
};

export const Empty = Template.bind({});
Empty.args = {
  plugins: demoEmpty,
};

/** NOTE: The save button will load by default on plugin page regardless of data */
export const DefaultSaveEnable = Template.bind({});
DefaultSaveEnable.args = {
  plugins: demoFewSaveEnable,
  onSave: plugins => {
    console.log('demo few', plugins);
  },
  saveAlwaysEnable: true,
};

export const ManyItems = Template.bind({});
ManyItems.args = {
  plugins: demoMany,
  onSave: plugins => {
    console.log('demo many', plugins);
  },
};

export const MoreItems = Template.bind({});
MoreItems.args = {
  plugins: demoMore,
  onSave: plugins => {
    console.log('demo more', plugins);
  },
};

export const EmptyHomepageItems = Template.bind({});
EmptyHomepageItems.args = {
  plugins: demoHomepageEmpty,
  onSave: (plugins: any) => {
    console.log('Empty Homepage', plugins);
  },
};

/**
 * createMigrationScenario creates example data showing the migration behavior
 * where catalog-installed plugins in the old plugins directory are treated as "user" plugins.
 *
 * The backend detects catalog-installed plugins by checking for isManagedByHeadlampPlugin=true
 * in the plugin's package.json. These plugins are automatically reclassified from "development"
 * to "user" type, ensuring correct priority order (development > user > shipped).
 */
function createMigrationScenario(): PluginInfo[] {
  return [
    // Catalog-installed plugin in old location (plugins dir) - treated as "user" type
    // This simulates a plugin that was installed via the catalog before the user-plugins directory existed.
    // Backend checks package.json for isManagedByHeadlampPlugin=true and reclassifies it as "user" type.
    {
      name: 'prometheus',
      description:
        'Prometheus monitoring plugin (catalog-installed in old location, has isManagedByHeadlampPlugin=true)',
      type: 'user' as const, // Backend detects isManagedByHeadlampPlugin=true and treats as user
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://artifacthub.io/packages/headlamp/headlamp/prometheus',
    },
    // New catalog-installed plugin in correct location (user-plugins)
    {
      name: 'flux',
      description: 'Flux GitOps plugin (catalog-installed in new location)',
      type: 'user' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://artifacthub.io/packages/headlamp/headlamp/flux',
    },
    // True development plugin - gets higher priority
    {
      name: 'my-dev-plugin',
      description: 'A plugin being actively developed',
      type: 'development' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://example.com/my-dev-plugin',
    },
    // Shipped plugin
    {
      name: 'default-dashboard',
      description: 'Default dashboard plugin',
      type: 'shipped' as const,
      isEnabled: true,
      isCompatible: true,
      isLoaded: true,
      homepage: 'https://headlamp.dev/plugins/dashboard',
    },
  ];
}

/** Story showing plugins installed in multiple locations with priority handling */
export const MultipleLocations = Template.bind({});
MultipleLocations.args = {
  plugins: createPluginsWithMultipleLocations(),
  onSave: (plugins: any) => {
    console.log('Multiple Locations', plugins);
  },
};

/** Story demonstrating migration of catalog-installed plugins from old location */
export const MigrationScenario = Template.bind({});
MigrationScenario.args = {
  plugins: createMigrationScenario(),
  onSave: (plugins: any) => {
    console.log('Migration Scenario', plugins);
  },
};
