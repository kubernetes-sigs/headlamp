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

  it('renders GFM tables whose header cells use raw <img> spacer tags (issue #7559)', () => {
    // Trimmed from the real v0.45.0 release body.
    const releaseNotes = `## Performance

| <img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/docs/images/icon.png" width="800" height="0" alt=""> | <img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/docs/images/icon.png" width="200" height="0" alt=""> |
|:--|--:|
| Plugin i18n now fetches only the active locale's translation file. | Thanks to:<br>@YousufFFFF<br>#7363 |`;

    render(<ReleaseNotesModal releaseNotes={releaseNotes} appVersion="0.45.0" />);

    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('cell', {
        name: "Plugin i18n now fetches only the active locale's translation file.",
      })
    ).toBeInTheDocument();

    expect(screen.queryByText(/<br>/)).not.toBeInTheDocument();

    // MUI's Dialog portals to document.body, outside RTL's `container`.
    const images = document.body.querySelectorAll('img');
    expect(images[0]).toHaveAttribute('width', '800');
    expect(images[0]).toHaveAttribute('height', '0');
    expect(images[1]).toHaveAttribute('width', '200');
    expect(images[1]).toHaveAttribute('height', '0');
  });

  it('drops non-http(s) src on raw <img> tags', () => {
    const releaseNotes =
      '<img src="javascript:alert(1)" alt="x" /><img src="https://example.com/ok.png" alt="ok" />';

    render(<ReleaseNotesModal releaseNotes={releaseNotes} appVersion="0.45.0" />);

    expect(document.body.querySelector('img[src^="javascript:"]')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ok' })).toHaveAttribute(
      'src',
      'https://example.com/ok.png'
    );
  });
});
