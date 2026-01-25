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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SimpleEditor from './SimpleEditor';

describe('SimpleEditor', () => {
  it('should render a textarea', () => {
    render(<SimpleEditor language="yaml" value="test" onChange={() => {}} />);
    const textarea = screen.getByLabelText('yaml Code');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('should display the value', () => {
    const value = 'apiVersion: v1\nkind: Pod';
    render(<SimpleEditor language="yaml" value={value} onChange={() => {}} />);
    const textarea = screen.getByLabelText('yaml Code') as HTMLTextAreaElement;
    expect(textarea.value).toBe(value);
  });

  it('should call onChange when text changes', () => {
    const onChange = vi.fn();
    render(<SimpleEditor language="yaml" value="" onChange={onChange} />);
    const textarea = screen.getByLabelText('yaml Code');
    fireEvent.change(textarea, { target: { value: 'new value' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('new value', expect.anything());
  });

  it('should forward ref to textarea', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<SimpleEditor language="yaml" value="" onChange={() => {}} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(ref.current).toBe(screen.getByLabelText('yaml Code'));
  });

  it('should have spellCheck disabled', () => {
    render(<SimpleEditor language="yaml" value="" onChange={() => {}} />);
    const textarea = screen.getByLabelText('yaml Code') as HTMLTextAreaElement;
    expect(textarea.getAttribute('spellCheck')).toBe('false');
  });

  it('should use language in aria-label', () => {
    render(<SimpleEditor language="json" value="" onChange={() => {}} />);
    const textarea = screen.getByLabelText('json Code');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
  });
});
