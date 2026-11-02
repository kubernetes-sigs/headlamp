# syntax=docker/dockerfile:1
# Final container image. Override it with --build-arg IMAGE_BASE=<image>. The
# default is on its own FROM line so that Dependabot can update it.
ARG IMAGE_BASE=default-image-base
FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS default-image-base
FROM ${IMAGE_BASE} AS image-base

FROM --platform=${BUILDPLATFORM} golang:1.26.10@sha256:24a707af49702fa44f02785475d02fb752f6982d3e9c0afb7696e1f0204e7ce9 AS backend-build
WORKDIR /headlamp

ARG TARGETOS
ARG TARGETARCH
ENV GOPATH=/go \
    GOPROXY=https://proxy.golang.org \
    GO111MODULE=on\
    CGO_ENABLED=0\ 
    GOOS=${TARGETOS}\
    GOARCH=${TARGETARCH}

# Keep go mod download separated so source changes don't trigger install
COPY ./backend/go.* /headlamp/backend/
RUN --mount=type=cache,target=/go/pkg/mod \
    cd ./backend && go mod download

COPY ./backend /headlamp/backend

RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    cd ./backend && go build -o ./headlamp-server ./cmd/

FROM --platform=${BUILDPLATFORM} node:22@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384 AS frontend-build

# Keep npm install separated so source changes don't trigger install
COPY frontend/package*.json /headlamp/frontend/
WORKDIR /headlamp
RUN cd ./frontend && npm ci --only=prod

FROM frontend-build AS frontend
ARG HEADLAMP_SOURCE_COMMIT
ARG HEADLAMP_BUILD_MANIFEST
ENV HEADLAMP_SOURCE_COMMIT=${HEADLAMP_SOURCE_COMMIT} \
    HEADLAMP_BUILD_MANIFEST=${HEADLAMP_BUILD_MANIFEST}

COPY ./frontend /headlamp/frontend

WORKDIR /headlamp

# Expose app metadata and manifests only while generating the frontend build.
RUN --mount=type=bind,source=app,target=/headlamp/app,ro \
    cd ./frontend && npm run build

RUN echo "*** Built Headlamp with version: ***"
RUN cat ./frontend/.env

# Backwards compatibility, move plugin folder to only copy matching plugins.
RUN mv plugins plugins-old || true

# Copy a .plugins folder if it is there to ./plugins, otherwise create an empty one.
# This is a Dockerfile quirky way to copy a folder if it exists, but also not fail if it is empty.
COPY ./.plugi*s ./plugins
RUN mkdir -p ./plugins

# Backwards compatibility, copy any matching plugins found inside "./plugins-old" into "./plugins".
# They should match plugins-old/MyFolder/main.js, otherwise they are not copied.
RUN for i in $(find ./plugins-old/*/main.js); do plugin_name=$(echo $i|cut -d'/' -f3); mkdir -p plugins/$plugin_name; cp $i plugins/$plugin_name; done
RUN for i in $(find ./plugins-old/*/package.json); do plugin_name=$(echo $i|cut -d'/' -f3); mkdir -p plugins/$plugin_name; cp $i plugins/$plugin_name; done

# Static (officially shipped) plugins
FROM --platform=${BUILDPLATFORM} frontend-build AS static-plugins
RUN apt-get update && apt-get install -y jq
COPY ./container/build-manifest.json ./container/fetch-plugins.sh /tools/

WORKDIR /tools
RUN mkdir -p /plugins
RUN ./fetch-plugins.sh /plugins/

FROM image-base AS final

# Create the non-root user
RUN if command -v apt-get > /dev/null; then \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && addgroup --system headlamp \
    && adduser --system --ingroup headlamp headlamp \
    && rm -rf /var/lib/apt/lists/*; \
    else \
    addgroup -S headlamp \
    && adduser -S headlamp -G headlamp; \
    fi

COPY --from=backend-build --link /headlamp/backend/headlamp-server /headlamp/headlamp-server
COPY --from=frontend --link /headlamp/frontend/build /headlamp/frontend
COPY --from=frontend --link /headlamp/plugins /headlamp/plugins
COPY --from=static-plugins --link /plugins /headlamp/static-plugins

RUN chown -R headlamp:headlamp /headlamp
USER headlamp

EXPOSE 4466

ENV HEADLAMP_STATIC_PLUGINS_DIR=/headlamp/static-plugins
ENTRYPOINT ["/headlamp/headlamp-server", "-html-static-dir", "/headlamp/frontend", "-plugins-dir", "/headlamp/plugins"]
