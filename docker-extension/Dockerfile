FROM ghcr.io/headlamp-k8s/headlamp:v0.33.0@sha256:99823f32b085e31d6344055b9c866cf24d0beb1ae3df1b879c4cfcb1f9c26311 as headlamp

FROM scratch

LABEL org.opencontainers.image.title="Headlamp" \
    org.opencontainers.image.description="An easy-to-use and extensible web UI for Kubernetes." \
    org.opencontainers.image.vendor="kinvolk" \
    com.docker.extension.categories="Kubernetes,utility-tools" \
    com.docker.desktop.extension.api.version=">= 0.2.0" \
    com.docker.extension.screenshots='[{"alt":"Cluster overview","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/cluster_overview.png"},{"alt":"Cluster Chooser","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/cluster_chooser.png"},{"alt":"Nodes list","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/nodes.png"},{"alt":"Resource Editor","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/resource_edition.png"},{"alt":"Editor Documentation","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/editor_documentation.png"},{"alt":"Terminal","url":"https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/terminal.png"}]' \
    com.docker.extension.detailed-description="Headlamp is an easy-to-use and extensible Kubernetes web UI. Headlamp was created to be a Kubernetes web UI that has the traditional functionality of other web UIs/dashboards available (i.e. to list and view resources) as well as other features." \
    com.docker.extension.publisher-url="https://kubernetes-sigs.github.io/headlamp/" \
    com.docker.extension.additional-urls="https://github.com/kubernetes-sigs/headlamp" \
    com.docker.extension.changelog="Please visit https://github.com/kubernetes-sigs/headlamp/releases for detailed changelog" \
    com.docker.desktop.extension.icon="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/frontend/public/apple-touch-icon.png" \
    com.docker.extension.additional-urls='[{"title":"Repository","url":"https://github.com/kubernetes-sigs/headlamp"},{"title":"Documentation","url":"https://headlamp.dev/docs/latest/"}]'

COPY headlamp.svg .
COPY metadata.json .
COPY docker-compose.yml .

COPY --from=headlamp /headlamp/frontend /ui
