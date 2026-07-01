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
import { useTranslation } from 'react-i18next';
import Job from '../../lib/k8s/job';
import { TestContext } from '../../test';
import NameValueTable from '../common/NameValueTable';
import { jobs } from '../job/storyHelper';
import { jobExtraInfo } from './extraInfo';

// Completed job from storyHelper has both startTime and completionTime, so it
// has a real duration. The running variant drops completionTime, so
// getDuration() returns -1 and the Duration row is hidden.
const completedJob = new Job(jobs[0] as any);
const runningJob = new Job({
  ...jobs[0],
  status: { ...jobs[0].status, completionTime: undefined },
} as any);

// jobExtraInfo takes a translator; render through NameValueTable to show which
// rows are actually displayed (hidden rows are dropped by the table).
function JobExtraInfo({ job }: { job: Job }) {
  const { t } = useTranslation();
  return <NameValueTable rows={jobExtraInfo(job, t)} />;
}

export default {
  title: 'workload/JobExtraInfo',
  component: JobExtraInfo,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<{ job: Job }> = args => <JobExtraInfo {...args} />;

// Completed job: the Duration row is shown.
export const Completed = Template.bind({});
Completed.args = { job: completedJob };

// Running job: getDuration() is -1, so the Duration row is hidden.
export const Running = Template.bind({});
Running.args = { job: runningJob };
