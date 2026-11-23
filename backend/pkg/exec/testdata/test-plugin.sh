#!/bin/bash -e

# Copyright 2018 The Kubernetes Authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

>&2 echo "$KUBERNETES_EXEC_INFO"
if [ -n "$TEST_CALLS_FILE" ]; then echo x >> "$TEST_CALLS_FILE"; fi
if [ -n "$TEST_STDERR" ]; then >&2 echo "$TEST_STDERR"; fi
if [ -n "$TEST_SLEEP_SECONDS" ]; then
  sleep "$TEST_SLEEP_SECONDS" &
  if [ -n "$TEST_CHILD_PID_FILE" ]; then echo $! > "$TEST_CHILD_PID_FILE"; fi
  wait $!
fi
if [ -n "$TEST_STDERR_HELPER_SECONDS" ]; then sleep "$TEST_STDERR_HELPER_SECONDS" > /dev/null & fi
echo "$TEST_OUTPUT"
exit "${TEST_EXIT_CODE:-0}"