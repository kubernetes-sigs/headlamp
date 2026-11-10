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

import '../../i18n/config';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// See CreateResourceForm.test.tsx: avoid the lib/k8s barrel cycle.
vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: CreateCronJobForm } = await import('./CreateCronJobForm');

/** A CronJob with every required field filled in. */
const filledCronJob = {
  apiVersion: 'batch/v1',
  kind: 'CronJob',
  metadata: { name: 'nightly-report', namespace: 'default' },
  spec: {
    schedule: '*/5 * * * *',
    jobTemplate: {
      spec: {
        template: {
          spec: {
            containers: [{ name: 'report', image: 'busybox:1.37' }],
            restartPolicy: 'OnFailure',
          },
        },
      },
    },
  },
};

/** Renders the form with its resource kept in state, like the create dialog does. */
function renderForm(initial: Record<string, any>) {
  const latest: { valid?: boolean } = {};
  function Harness() {
    const [resource, setResource] = React.useState(initial);
    return (
      <CreateCronJobForm
        resource={resource}
        onChange={setResource}
        onValidChange={valid => {
          latest.valid = valid;
        }}
      />
    );
  }
  render(<Harness />);
  return latest;
}

const scheduleInput = () => screen.getByRole('textbox', { name: /^Schedule/ });

describe('CreateCronJobForm schedule', () => {
  it('is required, so the form is not valid without a schedule', () => {
    const latest = renderForm(filledCronJob);
    expect(latest.valid).toBe(true);

    fireEvent.change(scheduleInput(), { target: { value: '' } });
    expect(latest.valid).toBe(false);

    fireEvent.change(scheduleInput(), { target: { value: '0 2 * * *' } });
    expect(latest.valid).toBe(true);
    expect(scheduleInput()).toBeRequired();
  });
});
