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
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import Details from './Details';
import { jobSets } from './storyHelper';

const jobSet = jobSets[0];

export default {
  title: 'JobSet/Details',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          // Mock the JobSet resource itself
          http.get(new RegExp('.*/apis/jobset.x-k8s.io/v1alpha2/namespaces/.*/jobsets/.*'), () =>
            HttpResponse.json(jobSet)
          ),
          // Mock the JobSet list/watch request
          http.get(new RegExp('.*/apis/jobset.x-k8s.io/v1alpha2/namespaces/.*/jobsets'), () =>
            HttpResponse.json({
              kind: 'JobSetList',
              metadata: {},
              items: [jobSet],
            })
          ),
          // Mock events
          http.get(new RegExp('.*/api/v1/namespaces/.*/events'), () =>
            HttpResponse.json({
              kind: 'EventList',
              metadata: {},
              items: [],
            })
          ),
          // Mock owned jobs
          http.get(new RegExp('.*/apis/batch/v1/namespaces/.*/jobs'), () =>
            HttpResponse.json({
              kind: 'JobList',
              metadata: {},
              items: [],
            })
          ),
          // Mock owned pods
          http.get(new RegExp('.*/api/v1/namespaces/.*/pods'), () =>
            HttpResponse.json({
              kind: 'PodList',
              metadata: {},
              items: [],
            })
          ),
          // Mock pod metrics
          http.get(new RegExp('.*/apis/metrics.k8s.io/v1beta1/namespaces/.*/pods'), () =>
            HttpResponse.json({
              kind: 'PodMetricsList',
              metadata: {},
              items: [],
            })
          ),
          // Mock conditions/status if needed (though usually part of the main resource)
          http.get(new RegExp('.*/status$'), () => HttpResponse.json(jobSet)),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = args => {
  return <Details name={jobSet.metadata.name} namespace={jobSet.metadata.namespace} {...args} />;
};

export const Default = Template.bind({});
Default.args = {};
