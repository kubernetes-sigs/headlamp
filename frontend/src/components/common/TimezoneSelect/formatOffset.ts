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

/** Formats a UTC offset given in hours, so 5.5 becomes +5:30 and 9 stays +9. */
export function formatOffset(offset: number) {
  const minutes = Math.round(Math.abs(offset) * 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${offset < 0 ? '-' : '+'}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}
