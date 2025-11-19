# syntax=docker/dockerfile:1
# Final container image
ARG IMAGE_BASE=alpine:3.22.2@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
FROM ${IMAGE_BASE} AS image-base


FROM --platform=${BUILDPLATFORM} golang:1.24.10@sha256:58364c0a7d53e26b6e5b83cf186b4e9d5fa078c4f5e728f9d9a7b972f689a84a AS backend-build

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

FROM --platform=${BUILDPLATFORM} node:22@sha256:4ad2c2b350ab49fb637ab40a269ffe207c61818bb7eb3a4ea122001a0c605e1f AS frontend-build

# We need .git and app/ in order to get the version and git version for the frontend/.env file
# that's generated when building the frontend.
COPY .git/ ./headlamp/.git/

COPY app/package.json /headlamp/app/package.json

# Keep npm install separated so source changes don't trigger install
COPY frontend/package*.json /headlamp/frontend/
WORKDIR /headlamp
RUN cd ./frontend && npm ci --only=prod

FROM frontend-build AS frontend
COPY ./frontend /headlamp/frontend

WORKDIR /headlamp

RUN cd ./frontend && npm run build

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

RUN if command -v apt-get > /dev/null; then \
        apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        && addgroup --system headlamp \
        && adduser --system --ingroup headlamp headlamp \
        && rm -rf /var/lib/apt/lists/*; \
    else \
        addgroup -S headlamp && adduser -S headlamp -G headlamp; \
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
