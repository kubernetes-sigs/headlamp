# Dynamic Copyright Years in License Headers

This document explains how Headlamp handles copyright years in license headers across the codebase.

## Overview

Headlamp automatically maintains copyright years in license headers using a build-time script. This ensures that all source files have consistent and up-to-date copyright notices without requiring manual updates.

## How It Works

The system consists of several components:

1. **Core Script**: `scripts/update-copyright-years.js` - Updates copyright years in source files
2. **Build Integration**: Runs during the build process via npm scripts
3. **Annual GitHub Action**: Creates a PR on January 1st to update all copyright years

## Copyright Format

Copyright headers follow this format:

```
/*
 * Copyright CURRENT_YEAR The Kubernetes Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * ...
 */
```

Where `CURRENT_YEAR` is dynamically updated to the current calendar year (e.g., 2025)

## Usage

### Manual Update

You can manually update copyright years by running:

```bash
npm run update-copyright
```

### Testing the Update

To verify the copyright update functionality:

```bash
npm run test-copyright
```

## Annual Updates

A GitHub Action runs on January 1st each year to create a PR that updates all copyright years. This ensures the codebase stays current even if no builds are run.

## Implementation Details

The implementation uses a regex pattern to identify and replace copyright years:

```javascript
/Copyright\s+(\d{4}(?:-\d{4})?)\s+The Kubernetes Authors/g
```

This matches both single years (`2020`) and year ranges (`2020-2023`).

## Adding to New Files

When creating new files, please include the standard license header with the current copyright year:

```
/*
 * Copyright CURRENT_YEAR The Kubernetes Authors
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
```

The build process will ensure this is kept up to date.
