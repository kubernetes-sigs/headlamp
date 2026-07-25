#!/bin/bash

# Copyright 2025 The Kubernetes Authors.
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

# Packages the Headlamp Helm chart and, when HELM_CHART_PUSH=true, pushes it to
# an OCI registry. Before packaging, the script rewrites the image fields in
# charts/headlamp/values.yaml so the published chart points at the build's
# image (registry / repository / tag); a trap restores values.yaml on exit so
# the working tree is left clean even on failure.
#
# The chart --version is read from charts/headlamp/Chart.yaml (which must be
# valid SemVer). GIT_TAG is used only for the image tag and --app-version, so
# callers can pass non-SemVer values like a branch name or `git describe`
# output without breaking `helm package`.
#
# Environment variables:
#   DEST_CHART_DIR    Output directory for the packaged chart (default: bin/)
#   GIT_TAG           Image tag and chart appVersion (default: git describe)
#   IMAGE_REGISTRY    Image registry written into values.yaml
#                     (default: chart's current image.registry)
#   IMAGE_REPOSITORY  Image repository written into values.yaml
#                     (default: chart's current image.repository)
#   HELM_CHART_REPO   OCI repo to push the chart to
#                     (default: ${IMAGE_REGISTRY}/charts)
#   HELM_CHART_PUSH   If "true", helm push the packaged chart

set -o errexit
set -o nounset
set -o pipefail

DEST_CHART_DIR=${DEST_CHART_DIR:-bin/}

GIT_TAG=${GIT_TAG:-$(git describe --tags --match 'v*' --always --dirty)}

HELM=${HELM:-helm}
YQ=${YQ:-yq}

VALUES_FILE=charts/headlamp/values.yaml
CHART_FILE=charts/headlamp/Chart.yaml

# Chart --version must be valid SemVer; take it from Chart.yaml so it does not
# depend on GIT_TAG (which can be a branch name or `git describe` output).
chart_version=$(${YQ} ".version" "${CHART_FILE}")

# Default registry/repository to whatever is currently in values.yaml so the
# script also works against non-default registries without code edits.
default_registry=$(${YQ} ".image.registry" "${VALUES_FILE}")
default_repository=$(${YQ} ".image.repository" "${VALUES_FILE}")
IMAGE_REGISTRY=${IMAGE_REGISTRY:-${default_registry}}
IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-${default_repository}}
HELM_CHART_REPO=${HELM_CHART_REPO:-${IMAGE_REGISTRY}/charts}

# Restore values.yaml on any exit so a failed package/push does not leave the
# working tree dirty for subsequent build steps.
values_backup=$(mktemp)
cp "${VALUES_FILE}" "${values_backup}"
trap 'mv "${values_backup}" "${VALUES_FILE}"' EXIT

${YQ} e ".image.registry = \"${IMAGE_REGISTRY}\" | .image.repository = \"${IMAGE_REPOSITORY}\" | .image.tag = \"${GIT_TAG}\" | .image.pullPolicy = \"IfNotPresent\"" -i "${VALUES_FILE}"

${HELM} package --version "${chart_version}" --app-version "${GIT_TAG}" charts/headlamp -d "${DEST_CHART_DIR}"

if [ "${HELM_CHART_PUSH:-false}" = "true" ]; then
  ${HELM} push "${DEST_CHART_DIR}/headlamp-${chart_version}.tgz" "oci://${HELM_CHART_REPO}"
fi
