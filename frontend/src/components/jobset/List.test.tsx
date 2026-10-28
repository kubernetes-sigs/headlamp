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
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { useClustersServingStatus } from '../../lib/k8s/resourceAvailability';
import { TestContext } from '../../test';
import { theme } from '../TestHelpers/theme';
import JobSetList from './List';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../../lib/k8s/jobSet', () => ({
  default: { kind: 'JobSet', apiName: 'jobsets' },
}));

vi.mock('../../lib/k8s/resourceAvailability', () => ({
  useClustersServingStatus: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function renderJobSetList() {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <JobSetList />
      </ThemeProvider>
    </TestContext>
  );
}

describe('JobSetList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders disabled state with safe external documentation link attributes', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: [], isChecking: false });

    renderJobSetList();

    expect(screen.getByText(/JobSet is not enabled/i)).toBeInTheDocument();
    expect(mockListView).not.toHaveBeenCalled();

    const link = screen.getByRole('link', { name: /learn more/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://jobset.sigs.k8s.io/docs/installation/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('lists only from the selected clusters that have JobSet', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({
      clusters: ['cluster-b'],
      isChecking: false,
    });

    renderJobSetList();

    expect(screen.queryByText(/JobSet is not enabled/i)).not.toBeInTheDocument();
    const props = mockListView.mock.calls[0][0];
    expect(props.clusters).toEqual(['cluster-b']);
    expect(props.headerProps).toBeUndefined();
    expect(props.emptyActions).toBeUndefined();
  });

  it('offers no creation while another cluster may still turn out to have JobSet', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({
      clusters: ['cluster-b'],
      isChecking: true,
    });

    renderJobSetList();

    const props = mockListView.mock.calls[0][0];
    expect(props.clusters).toEqual(['cluster-b']);
    expect(props.headerProps).toEqual({ titleSideActions: [] });
    expect(props.emptyActions).toBeDefined();
  });

  it('shows that it is checking until the selected clusters have answered', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: undefined, isChecking: true });

    renderJobSetList();

    expect(screen.getByText(/Checking if JobSet is enabled/i)).toBeInTheDocument();
    expect(mockListView).not.toHaveBeenCalled();
  });
});
