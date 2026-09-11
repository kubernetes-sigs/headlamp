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

/**
 * Reads a message out of a caught value.
 *
 * A rejected promise carries whatever the thrower passed, so an HTTP or
 * third-party client may reject with a plain object that has a message rather
 * than with an Error.
 *
 * @param value - the value caught from a throw or a rejected promise.
 * @returns the message, or an empty string when the value carries none.
 */
export function getThrownMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const { message } = value as { message?: unknown };

    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
}

/**
 * Converts a caught value into an Error, keeping its message when it has one.
 *
 * @param value - the value caught from a throw or a rejected promise.
 * @param fallbackMessage - message to use when the value carries none.
 * @returns the value itself when it is already an Error, otherwise a new Error.
 */
export function toError(value: unknown, fallbackMessage = 'Unknown error'): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(getThrownMessage(value) || fallbackMessage);
}
