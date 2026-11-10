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

import React from 'react';

export interface PasswordFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

/**
 * Wraps password inputs in their own form.
 *
 * Browsers' password managers group all inputs that are not inside a form into a
 * single "login form". So a password input outside a form makes unrelated text
 * inputs on the page (e.g. the namespaces filter) be detected as username fields,
 * and the password manager popup shows up on them. Keeping each password input in
 * its own form prevents that.
 */
export default function PasswordForm({ children, onSubmit, style, ...other }: PasswordFormProps) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      style={{ margin: 0, ...style }}
      {...other}
    >
      {children}
    </form>
  );
}
