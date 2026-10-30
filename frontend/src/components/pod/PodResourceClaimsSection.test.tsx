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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import Pod from '../../lib/k8s/pod';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import PodResourceClaimsSection from './PodResourceClaimsSection';
import { podList, podWithResourceClaims } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

const renderSection = (pod: Pod) =>
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <PodResourceClaimsSection pod={pod} />
      </ThemeProvider>
    </TestContext>
  );

const cluster = 'gpu-cluster';
const namespace = podWithResourceClaims.metadata.namespace;

describe('PodResourceClaimsSection', () => {
  it('shows nothing for a Pod that holds no claim', () => {
    const { container } = renderSection(new Pod(podList[0]));

    expect(container).toBeEmptyDOMElement();
  });

  it('links every claim the Pod holds to its page, and says how the Pod names it', () => {
    renderSection(new Pod(podWithResourceClaims, cluster));

    for (const claim of [
      'shared-gpu',
      'trainer-0-gpu-x7k2q',
      'trainer-0-extended-resources-p26fr',
    ]) {
      expect(screen.getByRole('link', { name: claim })).toHaveAttribute(
        'href',
        `/c/${cluster}/resourceclaims/${namespace}/${claim}`
      );
    }
    expect(screen.getByText('Extended resource')).toBeVisible();
  });

  it('links the template a claim is generated from to its page', () => {
    renderSection(new Pod(podWithResourceClaims, cluster));

    for (const template of ['single-gpu', 'scratch-nvme']) {
      expect(screen.getByRole('link', { name: `Template: ${template}` })).toHaveAttribute(
        'href',
        `/c/${cluster}/resourceclaimtemplates/${namespace}/${template}`
      );
    }
  });

  it('marks a template claim that has not been generated yet', () => {
    renderSection(new Pod(podWithResourceClaims));

    expect(screen.getByText('Not generated yet')).toBeVisible();
    expect(screen.getByText('Template: scratch-nvme')).toBeVisible();
  });
});
