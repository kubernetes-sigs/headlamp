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
import { Meta, StoryFn } from '@storybook/react';
import A8RInfo from './A8RInfo';

export default {
  title: 'Resource/A8RInfo',
  component: A8RInfo,
  decorators: [
    Story => (
      <Box sx={{ p: 2, maxWidth: 520 }}>
        <Story />
      </Box>
    ),
  ],
  argTypes: {
    annotations: {
      control: 'object',
      description: 'Kubernetes annotations map. Only keys prefixed with "a8r.io/" are shown.',
    },
  },
} as Meta;

type A8RInfoProps = { annotations?: Record<string, string> };

const Template: StoryFn<A8RInfoProps> = args => <A8RInfo {...args} />;

export const FullMetadata = Template.bind({});
FullMetadata.args = {
  annotations: {
    'a8r.io/description': 'Frontend service serving the public website.',
    'a8r.io/owner': 'team-frontend',
    'a8r.io/repository': 'https://github.com/example/frontend',
    'a8r.io/documentation': 'https://docs.example.com/frontend',
    'a8r.io/chat': 'https://example.slack.com/archives/frontend',
    'a8r.io/bugs': 'https://github.com/example/frontend/issues',
    'a8r.io/support': 'https://support.example.com',
    'a8r.io/runbook': 'https://runbooks.example.com/frontend',
    'a8r.io/incidents': 'https://status.example.com',
    'a8r.io/uptime': 'https://status.example.com/uptime',
    'a8r.io/performance': 'https://grafana.example.com/d/frontend',
    'a8r.io/logs': 'https://kibana.example.com/app/logs',
    'a8r.io/dependencies': 'database, redis, auth-service',
  },
};
FullMetadata.storyName = 'Full metadata (all keys)';

export const MinimalMetadata = Template.bind({});
MinimalMetadata.args = {
  annotations: {
    'a8r.io/owner': 'team-platform',
    'a8r.io/description': 'Internal API gateway.',
  },
};
MinimalMetadata.storyName = 'Minimal metadata';

export const LinksOnly = Template.bind({});
LinksOnly.args = {
  annotations: {
    'a8r.io/repository': 'https://github.com/example/api',
    'a8r.io/documentation': 'https://docs.example.com/api',
    'a8r.io/logs': 'https://kibana.example.com/app/logs',
  },
};
LinksOnly.storyName = 'Links only';

export const MixedWithUnrelatedAnnotations = Template.bind({});
MixedWithUnrelatedAnnotations.args = {
  annotations: {
    'kubectl.kubernetes.io/last-applied-configuration': '{...}',
    'deployment.kubernetes.io/revision': '4',
    'a8r.io/owner': 'team-data',
    'a8r.io/description': 'ETL pipeline orchestrator.',
  },
};
MixedWithUnrelatedAnnotations.storyName = 'Mixed with unrelated annotations';

export const UnknownKeysIgnored = Template.bind({});
UnknownKeysIgnored.args = {
  annotations: {
    'a8r.io/favourite-color': 'blue',
    'a8r.io/owner': 'team-misc',
  },
};
UnknownKeysIgnored.storyName = 'Unknown a8r.io keys are ignored';

export const Empty = Template.bind({});
Empty.args = {
  annotations: {},
};
Empty.storyName = 'Empty (renders nothing)';
