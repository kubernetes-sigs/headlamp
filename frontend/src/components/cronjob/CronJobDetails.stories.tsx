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
import CronJobDetails from './Details';
import { cronJobList } from './storyHelper';

export default {
  title: 'CronJob/CronJobDetailsView',
  component: CronJobDetails,
  argTypes: {},
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/apis/batch/v1/namespaces/default/cronjobs', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
          http.get('http://localhost:4466/apis/batch/v1/namespaces/default/jobs', () =>
            HttpResponse.json({
              kind: 'JobsList',
              metadata: {},
              items: [],
            })
          ),
          http.get('http://localhost:4466/apis/batch/v1beta1/cronjobs', () => HttpResponse.error()),
          http.get('http://localhost:4466/apis/batch/v1/jobs', () => HttpResponse.error()),
        ],
      },
    },
  },
} as Meta;

interface MockerStory {
  cronJobName: string;
}

const Template: StoryFn<MockerStory> = args => {
  const { cronJobName } = args;

  return (
    <TestContext routerMap={{ namespace: 'default', name: cronJobName }}>
      <CronJobDetails />
    </TestContext>
  );
};

export const EveryMinute = Template.bind({});
EveryMinute.args = {
  cronJobName: 'every-minute',
};
EveryMinute.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/batch/v1/namespaces/default/cronjobs/every-minute',
          () => HttpResponse.json(cronJobList.find(it => it.metadata.name === 'every-minute'))
        ),
      ],
    },
  },
};

export const EveryAst = Template.bind({});
EveryAst.args = {
  cronJobName: 'every-minute-one-char',
};
EveryAst.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/batch/v1/namespaces/default/cronjobs/every-minute-one-char',
          () =>
            HttpResponse.json(cronJobList.find(it => it.metadata.name === 'every-minute-one-char'))
        ),
      ],
    },
  },
};
