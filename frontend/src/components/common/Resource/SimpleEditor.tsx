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

import { styled } from '@mui/system';

const SizedTextarea = styled('textarea')({
  width: '100%',
  minHeight: '40vh',
});

export interface SimpleEditorProps {
  /** Programming language. */
  language: string;
  /** The thing we are editing. */
  value: string | undefined;
  /** When things in the editor change. */
  onChange(value: string | undefined, ev: any): void;
}

/** A very basic code editor. */
function SimpleEditor({ language, value, onChange }: SimpleEditorProps) {
  // TextareaAutosize doesn't react well within a dialog/tab
  return (
    <SizedTextarea
      aria-label={`${language} Code`}
      onChange={event => onChange(event.target.value, event)}
      value={value}
      spellCheck="false"
    />
  );
}

export default SimpleEditor;
