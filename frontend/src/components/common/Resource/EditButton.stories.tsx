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

import '../../../i18n/config';
import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { getTestDate } from '../../../helpers/testHelpers';
import ConfigMap from '../../../lib/k8s/configMap';
import Pod from '../../../lib/k8s/pod';
import { API_BASE, TestContext } from '../../../test';
import { ActivitiesRenderer, Activity } from '../../activity/Activity';
import EditButton from './EditButton';

const metadata = (name: string) => ({
  uid: `uid-${name}`,
  name,
  namespace: 'default',
  resourceVersion: '1',
  creationTimestamp: getTestDate().toISOString(),
});

// Real KubeObject instances, so clicking Edit can fetch the latest object
// (served by the msw handlers below) and open the editor.
const configMap = new ConfigMap(
  {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: metadata('my-configmap'),
    data: { key: 'value' },
  },
  'minikube'
);

const pod = new Pod(
  {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: metadata('my-pod'),
    spec: { containers: [{ name: 'main', image: 'busybox' }], nodeName: 'node-1' },
    status: { phase: 'Running', conditions: [], containerStatuses: [], startTime: '' },
  } as any,
  'minikube'
);

// Closes the editor Activity a story launched, so it does not carry over to other stories.
function ActivityCleanup({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return () => {
      Activity.reset();
    };
  }, []);

  return <>{children}</>;
}

export default {
  title: 'Resource/EditButton',
  component: EditButton,
  decorators: [
    // EditButton opens the editor with Activity.launch(), so the stories need an activity host
    // and the #main container it renders into, laid out as in Activity.stories.tsx.
    Story => (
      <TestContext>
        <Box
          sx={{
            display: 'grid',
            overflow: 'hidden',
            position: 'relative',
            gridTemplateRows: '1fr min-content',
            gridTemplateColumns: 'min-content 1fr',
            width: '100%',
            height: '90vh',
          }}
        >
          <Box
            id="main"
            sx={{
              overflow: 'auto',
              position: 'relative',
              minHeight: '0',
              gridColumn: '2/3',
              gridRow: '1/2',
            }}
          >
            <Story />
          </Box>
          <ActivityCleanup>
            <ActivitiesRenderer />
          </ActivityCleanup>
        </Box>
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.post(
            `${API_BASE}/clusters/minikube/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
          http.get(
            `${API_BASE}/clusters/minikube/api/v1/namespaces/default/configmaps/my-configmap`,
            () => HttpResponse.json(configMap.jsonData)
          ),
          http.get(`${API_BASE}/clusters/minikube/api/v1/namespaces/default/pods/my-pod`, () =>
            HttpResponse.json(pod.jsonData)
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn<typeof EditButton> = args => <EditButton {...args} />;

export const Default = Template.bind({});
Default.args = {
  item: configMap,
};

export const CustomStyle = Template.bind({});
CustomStyle.args = {
  item: pod,
  buttonStyle: 'menu',
};
