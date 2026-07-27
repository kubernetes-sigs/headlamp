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

import { render, screen, within } from '@testing-library/react';
import ReleaseNotesModal from './ReleaseNotesModal';

vi.mock('@iconify/react', () => ({ Icon: () => null }));

describe('ReleaseNotesModal', () => {
  it('renders GitHub release-note tables and HTML images', () => {
    const releaseNotes = `## Changes

| Feature | Status |
| ------- | ------ |
| Tables | Ready |

<img alt="Release preview" src="https://example.com/release.png" />`;

    render(<ReleaseNotesModal releaseNotes={releaseNotes} appVersion="1.2.3" />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Tables' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Release preview' })).toHaveAttribute(
      'src',
      'https://example.com/release.png'
    );
  });
});
