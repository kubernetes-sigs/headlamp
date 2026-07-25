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
 * UTF-8 safe base64 helpers.
 *
 * The platform `btoa`/`atob` only operate on the Latin1 range (code points
 * 0-255) and throw `InvalidCharacterError` for any other character. These
 * helpers encode/decode through UTF-8 first, so text containing non-Latin1
 * characters (CJK, emoji, etc.) is handled correctly.
 *
 * The output is standard base64 of the UTF-8 bytes, which is identical to
 * plain `btoa` for ASCII input and matches what the backend expects.
 *
 * NOTE: Use these only for *text*. Raw binary data (e.g. Kubernetes secret
 * values) must keep using `atob`/`btoa` directly, since running bytes through
 * `TextDecoder`/`TextEncoder` would corrupt them.
 */

/**
 * Encodes a string to base64, handling characters outside the Latin1 range.
 *
 * @param str - The string to encode.
 * @returns The base64 encoded representation of the UTF-8 bytes of `str`.
 */
export function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  // Build in chunks to avoid O(n^2) string concatenation and argument limits.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string that was produced from UTF-8 bytes.
 *
 * Falls back to the raw Latin1 string for legacy values that were produced by a
 * plain `btoa()` on a Latin1 JS string (e.g. names containing "é"), so existing
 * stored kubeconfigs/IDs keep decoding correctly.
 *
 * @param base64 - The base64 string to decode.
 * @returns The decoded string.
 */
export function decodeBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return binary;
  }
}
