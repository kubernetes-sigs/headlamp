GO111MODULE=on
export GO111MODULE

SERVER_EXE_EXT ?=
DOCKER_CMD ?= docker
DOCKER_BUILDX_CMD ?= buildx
DOCKER_REPO ?= ghcr.io/headlamp-k8s
DOCKER_EXT_REPO ?= docker.io/headlamp
DOCKER_IMAGE_NAME ?= headlamp
DOCKER_PLUGINS_IMAGE_NAME ?= plugins
DOCKER_IMAGE_VERSION ?= $(shell git describe --tags --always --dirty)
DOCKER_PLATFORM ?= local
DOCKER_PUSH ?= false

ifeq ($(OS), Windows_NT)
	SERVER_EXE_EXT = .exe
endif

ifeq ($(OS), Windows_NT)
	UNIXSHELL = false
	ifdef BASH_VERSION
		UNIXSHELL = true
	endif
	ifdef BASH_VERSION
		UNIXSHELL = true
	endif
else
	UNIXSHELL = true
endif

all: backend frontend

tools/golangci-lint: backend/go.mod backend/go.sum
	GOBIN=`pwd`/backend/tools go install github.com/golangci/golangci-lint/cmd/golangci-lint@v1.64

backend-lint: tools/golangci-lint
	cd backend && ./tools/golangci-lint run

backend-lint-fix: tools/golangci-lint
	cd backend && ./tools/golangci-lint run --fix

frontend/build:
	make frontend

.PHONY: app
app-build: frontend/build
	cd app && npm install && node ./scripts/setup-plugins.js && npm run build
app: app-build
	cd app && npm run package -- --win --linux --mac
app-win: app-build
	cd app && npm run package -- --win
app-win-msi: app-build
	cd app && npm run package-msi
app-linux: app-build
	cd app && npm run package -- --linux
app-mac: app-build
	cd app && npm run package -- --mac

.PHONY: backend
backend:
	cd backend && go build -o ./headlamp-server${SERVER_EXE_EXT} ./cmd

.PHONY: backend-test
backend-test:
	cd backend && go test -v -p 1 ./...

.PHONY: backend-coverage
backend-coverage:
	cd backend && go test -v -p 1 -coverprofile=coverage.out ./...
	cd backend && go tool cover -func=coverage.out

.PHONY: backend-coverage-html
backend-coverage-html:
	cd backend && go test -v -p 1 -coverprofile=coverage.out ./...
	cd backend && go tool cover -html=coverage.out

.PHONY: backend-format
backend-format:
	cd backend && go fmt ./cmd/ ./pkg/**

frontend-install:
	cd frontend && npm install

frontend-install-ci:
	cd frontend && npm ci

.PHONY: frontend
frontend: frontend-install
	cd frontend && npm run build

.PHONY: frontend-build
frontend-build:
	cd frontend && npm run build

.PHONY: frontend-build-storybook
frontend-build-storybook:
	cd frontend && npm run build-storybook

run-backend:
	@echo "**** Warning: Running with Helm and dynamic-clusters endpoints enabled. ****"

ifeq ($(UNIXSHELL),true)
	HEADLAMP_BACKEND_TOKEN=headlamp HEADLAMP_CONFIG_ENABLE_HELM=true HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true ./backend/headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost
else
	@echo "**** Running on Windows without bash or zsh. ****"
	@cmd /c "set HEADLAMP_BACKEND_TOKEN=headlamp&& set HEADLAMP_CONFIG_ENABLE_HELM=true&& set HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true&& backend\headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost"
endif

run-backend-with-metrics:
	@echo "**** Running backend with Prometheus metrics enabled ****"
ifeq ($(UNIXSHELL),true)
	HEADLAMP_BACKEND_TOKEN=headlamp \
    HEADLAMP_CONFIG_METRICS_ENABLED=true \
    HEADLAMP_CONFIG_ENABLE_HELM=true \
    HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true \
    ./backend/headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost
else
	@echo "**** Running on Windows without bash or zsh. ****"
	@cmd /c "set HEADLAMP_BACKEND_TOKEN=headlamp&& set HEADLAMP_CONFIG_METRICS_ENABLED=true&& set HEADLAMP_CONFIG_ENABLE_HELM=true&& set HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true&& backend\headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost"
endif

run-backend-with-traces:
	@echo "**** Running backend with distributed tracing enabled ****"
ifeq ($(UNIXSHELL),true)
	HEADLAMP_BACKEND_TOKEN=headlamp \
    HEADLAMP_CONFIG_TRACING_ENABLED=true \
    HEADLAMP_CONFIG_ENABLE_HELM=true \
    HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true \
    ./backend/headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost
else
	@echo "**** Running on Windows without bash or zsh. ****"
	@cmd /c "set HEADLAMP_BACKEND_TOKEN=headlamp&& set HEADLAMP_CONFIG_TRACING_ENABLED=true&& set HEADLAMP_CONFIG_ENABLE_HELM=true&& set HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true&& backend\headlamp-server -dev -proxy-urls https://artifacthub.io/* -listen-addr=localhost"
endif

run-frontend:
ifeq ($(UNIXSHELL),true)
	cd frontend && nice -16 npm start
else
	cd frontend && npm start
endif

run-app:
	cd app && npm install && node ./scripts/setup-plugins.js && npm run start

run-only-app:
	cd app && npm install && node ./scripts/setup-plugins.js && npm run dev-only-app

frontend-lint:
	cd frontend && npm run lint -- --max-warnings 0 && npm run format-check

frontend-fixlint:
	cd frontend && npm run lint -- --fix && npm run format

.PHONY: frontend-tsc
frontend-tsc:
	cd frontend && npm run tsc

.PHONY: frontend-i18n-check
frontend-i18n-check:
	@echo "Checking translations. If this fails use: 'npm run i18n'"
	cd frontend && npm run i18n -- --fail-on-update

frontend-test:
	cd frontend && npm run test -- --coverage

plugins-test:
	cd plugins/headlamp-plugin && npm install && ./test-headlamp-plugin.js
	cd plugins/headlamp-plugin && ./test-plugins-examples.sh
	cd plugins/headlamp-plugin/plugin-management && node ./plugin-management.e2e.js
	cd plugins/headlamp-plugin/plugin-management && npx jest ./plugin-management.test.js

# IMAGE_BASE can be used to specify a base final image.
#   IMAGE_BASE=debian:latest make image
image:
	@if [ -n "${IMAGE_BASE}" ]; then \
		BUILD_ARG="--build-arg IMAGE_BASE=${IMAGE_BASE}"; \
	else \
		BUILD_ARG=""; \
	fi; \
	$(DOCKER_CMD) $(DOCKER_BUILDX_CMD) build \
	--pull \
	--platform=$(DOCKER_PLATFORM) \
	$$BUILD_ARG \
	--push=$(DOCKER_PUSH) \
	-t $(DOCKER_REPO)/$(DOCKER_IMAGE_NAME):$(DOCKER_IMAGE_VERSION) -f \
	Dockerfile \
	.

.PHONY: build-plugins-container
build-plugins-container:
	$(DOCKER_CMD) $(DOCKER_BUILDX_CMD) build \
	--pull \
	--platform=linux/amd64 \
	--push=$(DOCKER_PUSH) \
	-t $(DOCKER_REPO)/$(DOCKER_PLUGINS_IMAGE_NAME):$(DOCKER_IMAGE_VERSION) -f \
	Dockerfile.plugins \
	.

docker-ext:
	$(eval LATEST_TAG=$(shell git tag --list --sort=version:refname 'v*' | tail -1 | sed 's/^.//'))
	$(DOCKER_CMD) $(DOCKER_BUILDX_CMD) build \
	--platform=linux/amd64,linux/arm64 \
	--push \
	-t $(DOCKER_EXT_REPO)/$(DOCKER_IMAGE_NAME)-docker-extension:${LATEST_TAG} \
	-t $(DOCKER_EXT_REPO)/$(DOCKER_IMAGE_NAME)-docker-extension:latest -f \
	./docker-extension/Dockerfile \
	./docker-extension

.PHONY: docs
docs:
	cd frontend && npm install && npm run build-typedoc

.PHONY: storybook
storybook:
	cd frontend && npm install && npm run storybook

i18n:
	cd app && npm run i18n
	cd frontend && npm run i18n

.PHONY: helm-template-test
helm-template-test:
	charts/headlamp/tests/test.sh

.PHONY: helm-update-template-version
helm-update-template-version:
	charts/headlamp/tests/update-version.sh

# TODO: add windows compatibility
.PHONY: run-jaeger
run-jaeger:
	@echo "Starting Jaeger container..."
	@docker rm -f jaeger 2>/dev/null || true
	@docker run -d --name jaeger \
        -p 16686:16686 \
        -p 4317:4317 \
        -p 4318:4318 \
        -e COLLECTOR_OTLP_ENABLED=true \
        jaegertracing/all-in-one:latest
	@echo "Jaeger UI will be available at http://localhost:16686"
	@echo "OTLP endpoints: grpc://localhost:4317, http://localhost:4318"

.PHONY: run-prometheus
run-prometheus:
	@echo "Starting Prometheus container..."
	@docker rm -f prometheus 2>/dev/null || true
	@docker run -d \
        --name prometheus \
        --network host \
        -p 9090:9090 \
        -v $(PWD)/backend/pkg/telemetry/prometheus.yaml:/etc/prometheus.yaml \
        prom/prometheus:latest --config.file=/etc/prometheus.yaml
	@echo "Prometheus UI will be available at http://localhost:9090"

.PHONY: run-monitoring
run-monitoring: run-jaeger run-prometheus
	@echo "Monitoring stack is ready:"
	@echo "- Jaeger UI: http://localhost:16686"
	@echo "- Prometheus UI: http://localhost:9090"

.PHONY: stop-monitoring
stop-monitoring:
	@echo "Stopping monitoring containers..."
	@docker rm -f jaeger prometheus 2>/dev/null || true
	@echo "Monitoring containers stopped"
