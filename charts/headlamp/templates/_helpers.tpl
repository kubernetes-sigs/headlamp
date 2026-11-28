{{/*
Expand the name of the chart.
*/}}
{{- define "headlamp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "headlamp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Expand the namespace of the release.
Allows overriding it for multi-namespace deployments in combined charts.
*/}}
{{- define "headlamp.namespace" -}}
  {{- if .Values.namespaceOverride }}
    {{- .Values.namespaceOverride | trunc 63 | trimSuffix "-" -}}
  {{- else if .Release.Namespace }}
    {{- .Release.Namespace | trunc 63 | trimSuffix "-" -}}
  {{- else -}}
    default
  {{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "headlamp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "headlamp.labels" -}}
helm.sh/chart: {{ include "headlamp.chart" . }}
{{ include "headlamp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "headlamp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "headlamp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "headlamp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "headlamp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}


{{/*
Expand Kubernetes-style environment references once, preserving pod-only values
as unknown and escaped dollars as literals. Return JSON state.
*/}}
{{- define "headlamp.literalEnvValue" -}}
{{- $known := .state.known -}}
{{- $value := .state.value -}}
{{- if and $known (not (default false .state.expanded)) -}}
  {{- $pattern := "\\$\\$|\\$\\([^)]*\\)" -}}
  {{- $parts := regexSplit $pattern $value -1 -}}
  {{- $resolved := index $parts 0 -}}
  {{- range $index, $token := regexFindAll $pattern $value -1 -}}
    {{- $replacement := $token -}}
    {{- if eq $token "$$" -}}
      {{- $replacement = "$" -}}
    {{- else -}}
      {{- $name := trimPrefix "$(" (trimSuffix ")" $token) -}}
      {{- $entry := get $.environment $name -}}
      {{- if and $entry $entry.known -}}
        {{- $replacement = $entry.value -}}
      {{- else -}}
        {{- $known = false -}}
      {{- end -}}
    {{- end -}}
    {{- $resolved = printf "%s%s%s" $resolved $replacement (index $parts (add1 $index)) -}}
  {{- end -}}
  {{- $value = $resolved -}}
{{- end -}}
{{- dict "known" $known "value" $value "expanded" true | toJson -}}
{{- end -}}

{{/*
Resolve a discovery boolean using literal environment values.
Return JSON with known/enabled/valid fields; pod-only values stay unknown.
*/}}
{{- define "headlamp.discoveryFlagState" -}}
{{- $state := include "headlamp.literalEnvValue" . | fromJson -}}
{{- $known := $state.known -}}
{{- $value := $state.value -}}
{{- $enabled := and $known (has $value (list "1" "t" "T" "TRUE" "true" "True")) -}}
{{- $valid := and $known (or $enabled (has $value (list "0" "f" "F" "FALSE" "false" "False"))) -}}
{{- dict "known" $known "value" $value "expanded" true "enabled" $enabled "valid" $valid | toJson -}}
{{- end -}}

{{/*
Check if readOnlyRootFilesystem is enabled, returns string "true" if enabled, otherwise returns "false".
*/}}
{{- define "headlamp.readOnlyRootFilesystem" -}}
{{- $securityContextReadOnly := and .securityContext (hasKey .securityContext "readOnlyRootFilesystem") .securityContext.readOnlyRootFilesystem -}}
{{- if $securityContextReadOnly -}}true{{- else -}}false{{- end -}}
{{- end }}

{{/*
Compute whether to auto-add a writable /tmp emptyDir for a container with
readOnlyRootFilesystem: true.

- addMount is false when the user already has a volumeMount at /tmp
  (avoids duplicate mountPath).
- addVolume is false when the user already has a /tmp mount (avoids an
  orphaned volume) OR when a volume with mountName already exists (allows
  users to supply their own headlamp-tmp with custom emptyDir settings
  such as sizeLimit, while the chart still wires up the /tmp mount).

Input (dict):
  volumeMounts - list of existing volumeMounts for this container
  volumes      - list of existing pod-level volumes
  readOnly     - bool: is readOnlyRootFilesystem active for this container
  mountName    - string: name for the auto-created volume (e.g. "headlamp-tmp")

Output (YAML dict, intended for use with fromYaml):
  addMount: bool
  addVolume: bool
*/}}
{{- define "headlamp.tmpVolumeContext" -}}
{{- $hasTmpMount := false -}}
{{- range .volumeMounts -}}
  {{- if eq .mountPath "/tmp" -}}{{- $hasTmpMount = true -}}{{- end -}}
{{- end -}}
{{- $hasTmpVolume := false -}}
{{- range .volumes -}}
  {{- if eq .name $.mountName -}}{{- $hasTmpVolume = true -}}{{- end -}}
{{- end -}}
addMount: {{ and .readOnly (not $hasTmpMount) }}
addVolume: {{ and .readOnly (not $hasTmpMount) (not $hasTmpVolume) }}
{{- end }}

{{/*
Validate a parsed admin settings document (from inline YAML/JSON string or
structured config.settings object) so invalid top-level or known nested keys
fail fast during helm template / helm lint.
*/}}
{{- define "headlamp.validateAdminSettingsDoc" -}}
{{- $doc := .doc -}}
{{- if not (kindIs "map" $doc) -}}
  {{- fail "config.settings must decode to a YAML/JSON object" -}}
{{- end -}}
{{- $allowedTop := list "defaults" "clusterDefinedSettings" -}}
{{- range $k, $_ := $doc -}}
  {{- if not (has $k $allowedTop) -}}
    {{- fail (printf "config.settings contains unsupported top-level key %q; supported keys are \"defaults\" and \"clusterDefinedSettings\"" $k) -}}
  {{- end -}}
{{- end -}}
{{- if hasKey $doc "defaults" -}}
  {{- $defaults := $doc.defaults -}}
  {{- if not (kindIs "map" $defaults) -}}
    {{- fail "config.settings.defaults must be an object" -}}
  {{- end -}}
  {{- $allowedDefaults := list "tableRowsPerPageOptions" "timezone" "sidebarSortAlphabetically" "expandLargeGraph" "useEvict" "tutorialTooltips" "theme" "clusters" "plugins" -}}
  {{- range $k, $v := $defaults -}}
    {{- if not (has $k $allowedDefaults) -}}
      {{- fail (printf "config.settings.defaults contains unsupported key %q" $k) -}}
    {{- end -}}
    {{- $fieldPath := printf "defaults.%s" $k -}}
    {{- if eq $k "tableRowsPerPageOptions" -}}
      {{- include "headlamp.validateWrappedPositiveIntArray" (dict "path" $fieldPath "val" $v) -}}
    {{- else if eq $k "timezone" -}}
      {{- include "headlamp.validateWrappedString" (dict "path" $fieldPath "val" $v "allowEmpty" false) -}}
    {{- else if has $k (list "sidebarSortAlphabetically" "expandLargeGraph" "useEvict" "tutorialTooltips") -}}
      {{- include "headlamp.validateWrappedBool" (dict "path" $fieldPath "val" $v) -}}
    {{- else if eq $k "theme" -}}
      {{- include "headlamp.validateWrappedTheme" (dict "path" $fieldPath "val" $v) -}}
    {{- end -}}
  {{- end -}}
  {{- if hasKey $defaults "clusters" -}}
    {{- if not (kindIs "map" $defaults.clusters) -}}
      {{- fail "config.settings.defaults.clusters must be an object" -}}
    {{- end -}}
    {{- $allowedClusterKeys := list "defaultNamespace" "allowedNamespaces" "allowedNamespacesSelector" "currentName" "nodeShellTerminal" "podDebugTerminal" "appearance" -}}
    {{- range $clusterName, $rawClusterCfg := $defaults.clusters -}}
      {{- if eq $clusterName "" -}}
        {{- fail "config.settings.defaults.clusters keys must be non-empty strings" -}}
      {{- end -}}
      {{- $clusterPath := printf "defaults.clusters.%s" $clusterName -}}
      {{- include "headlamp.validateAdminSettingsWrapper" (dict "path" $clusterPath "val" $rawClusterCfg) -}}
      {{- $clusterCfg := $rawClusterCfg -}}
      {{- if and (kindIs "map" $rawClusterCfg) (hasKey $rawClusterCfg "$value") -}}
        {{- $clusterCfg = get $rawClusterCfg "$value" -}}
      {{- end -}}
      {{- if not (kindIs "map" $clusterCfg) -}}
        {{- fail (printf "config.settings.%s must be an object" $clusterPath) -}}
      {{- end -}}
      {{- range $ck, $cv := $clusterCfg -}}
        {{- if not (has $ck $allowedClusterKeys) -}}
          {{- fail (printf "config.settings.%s contains unsupported key %q" $clusterPath $ck) -}}
        {{- end -}}
        {{- $ckPath := printf "%s.%s" $clusterPath $ck -}}
        {{- if has $ck (list "defaultNamespace" "allowedNamespacesSelector" "currentName") -}}
          {{- include "headlamp.validateWrappedString" (dict "path" $ckPath "val" $cv "allowEmpty" true) -}}
        {{- else if eq $ck "allowedNamespaces" -}}
          {{- include "headlamp.validateWrappedStringArray" (dict "path" $ckPath "val" $cv) -}}
        {{- else if eq $ck "nodeShellTerminal" -}}
          {{- include "headlamp.validateWrappedNodeShellTerminal" (dict "path" $ckPath "val" $cv) -}}
        {{- else if eq $ck "podDebugTerminal" -}}
          {{- include "headlamp.validateWrappedPodDebugTerminal" (dict "path" $ckPath "val" $cv) -}}
        {{- else if eq $ck "appearance" -}}
          {{- include "headlamp.validateWrappedAppearance" (dict "path" $ckPath "val" $cv) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
  {{- if hasKey $defaults "plugins" -}}
    {{- if not (kindIs "map" $defaults.plugins) -}}
      {{- fail "config.settings.defaults.plugins must be an object" -}}
    {{- end -}}
    {{- range $pluginName, $pluginCfg := $defaults.plugins -}}
      {{- if eq $pluginName "" -}}
        {{- fail "config.settings.defaults.plugins keys must be non-empty strings" -}}
      {{- end -}}
      {{- if not (kindIs "map" $pluginCfg) -}}
        {{- fail (printf "config.settings.defaults.plugins.%s must be an object" $pluginName) -}}
      {{- end -}}
      {{- range $pk, $pv := $pluginCfg -}}
        {{- if eq $pk "" -}}
          {{- fail (printf "config.settings.defaults.plugins.%s keys must be non-empty strings" $pluginName) -}}
        {{- end -}}
        {{- include "headlamp.validatePluginValue" (dict "path" (printf "defaults.plugins.%s.%s" $pluginName $pk) "val" $pv) -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- if hasKey $doc "clusterDefinedSettings" -}}
  {{- $cds := $doc.clusterDefinedSettings -}}
  {{- if kindIs "slice" $cds -}}
    {{- range $idx, $entry := $cds -}}
      {{- if or (not (kindIs "string" $entry)) (eq (trim $entry) "") -}}
        {{- fail (printf "config.settings.clusterDefinedSettings[%d] must be a non-empty cluster name string" $idx) -}}
      {{- end -}}
    {{- end -}}
  {{- else if kindIs "map" $cds -}}
    {{- range $clusterName, $sources := $cds -}}
      {{- if eq $clusterName "" -}}
        {{- fail "config.settings.clusterDefinedSettings keys must be non-empty strings" -}}
      {{- end -}}
      {{- if not (kindIs "slice" $sources) -}}
        {{- fail (printf "config.settings.clusterDefinedSettings.%s must be a list of source objects" $clusterName) -}}
      {{- end -}}
      {{- range $idx, $src := $sources -}}
        {{- if not (kindIs "map" $src) -}}
          {{- fail (printf "config.settings.clusterDefinedSettings.%s[%d] must be an object" $clusterName $idx) -}}
        {{- end -}}
        {{- range $sk, $_ := $src -}}
          {{- if not (has $sk (list "name" "type" "namespace")) -}}
            {{- fail (printf "config.settings.clusterDefinedSettings.%s[%d] contains unsupported key %q" $clusterName $idx $sk) -}}
          {{- end -}}
        {{- end -}}
        {{- if or (not (hasKey $src "name")) (not (kindIs "string" $src.name)) (eq (trim $src.name) "") -}}
          {{- fail (printf "config.settings.clusterDefinedSettings.%s[%d] requires a non-empty \"name\"" $clusterName $idx) -}}
        {{- end -}}
        {{- if and (hasKey $src "type") (or (not (kindIs "string" $src.type)) (not (has $src.type (list "configmap" "ConfigMap" "secret" "Secret")))) -}}
          {{- fail (printf "config.settings.clusterDefinedSettings.%s[%d].type must be \"configmap\" or \"secret\", got %q" $clusterName $idx ($src.type | toString)) -}}
        {{- end -}}
        {{- if and (hasKey $src "namespace") (or (not (kindIs "string" $src.namespace)) (eq (trim $src.namespace) "")) -}}
          {{- fail (printf "config.settings.clusterDefinedSettings.%s[%d].namespace must be a non-empty string" $clusterName $idx) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
  {{- else -}}
    {{- fail "config.settings.clusterDefinedSettings must be a list of cluster names or a map of cluster names to sources" -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{/*
Validate $value / $display / $clusterDefined wrapper fields when present.
*/}}
{{- define "headlamp.validateAdminSettingsWrapper" -}}
{{- $val := .val -}}
{{- $path := .path -}}
{{- if kindIs "map" $val -}}
  {{- if or (hasKey $val "$value") (hasKey $val "$display") (hasKey $val "$clusterDefined") -}}
    {{- if not (hasKey $val "$value") -}}
      {{- fail (printf "config.settings.%s has wrapper metadata ($display/$clusterDefined) without \"$value\"" $path) -}}
    {{- end -}}
    {{- range $wk, $_ := $val -}}
      {{- if not (has $wk (list "$value" "$display" "$clusterDefined")) -}}
        {{- fail (printf "config.settings.%s wrapper contains unsupported key %q" $path $wk) -}}
      {{- end -}}
    {{- end -}}
    {{- if hasKey $val "$display" -}}
      {{- $display := get $val "$display" -}}
      {{- if or (not (kindIs "string" $display)) (not (has $display (list "normal" "disabled" "hidden"))) -}}
        {{- fail (printf "config.settings.%s.$display must be \"normal\", \"disabled\", or \"hidden\", got %q" $path ($display | toString)) -}}
      {{- end -}}
    {{- end -}}
    {{- if hasKey $val "$clusterDefined" -}}
      {{- $cd := get $val "$clusterDefined" -}}
      {{- if not (kindIs "slice" $cd) -}}
        {{- fail (printf "config.settings.%s.$clusterDefined must be a list of cluster names" $path) -}}
      {{- end -}}
      {{- range $idx, $entry := $cd -}}
        {{- if or (not (kindIs "string" $entry)) (eq $entry "") -}}
          {{- fail (printf "config.settings.%s.$clusterDefined[%d] must be a non-empty string" $path $idx) -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedBool" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "bool" $v) -}}
  {{- fail (printf "config.settings.%s must be a boolean" .path) -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedString" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "string" $v) -}}
  {{- fail (printf "config.settings.%s must be a string" .path) -}}
{{- end -}}
{{- if and (not .allowEmpty) (eq $v "") -}}
  {{- fail (printf "config.settings.%s must be a non-empty string" .path) -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedStringArray" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "slice" $v) -}}
  {{- fail (printf "config.settings.%s must be an array of strings" .path) -}}
{{- end -}}
{{- range $idx, $item := $v -}}
  {{- if or (not (kindIs "string" $item)) (eq $item "") -}}
    {{- fail (printf "config.settings.%s[%d] must be a non-empty string" $.path $idx) -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedPositiveIntArray" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if or (not (kindIs "slice" $v)) (eq (len $v) 0) -}}
  {{- fail (printf "config.settings.%s must be a non-empty array of positive integers" .path) -}}
{{- end -}}
{{- range $idx, $item := $v -}}
  {{- if not (or (kindIs "int" $item) (kindIs "int64" $item) (kindIs "float64" $item)) -}}
    {{- fail (printf "config.settings.%s[%d] must be a positive integer" $.path $idx) -}}
  {{- end -}}
  {{- $num := float64 $item -}}
  {{- if or (lt $num 1.0) (ne (floor $num) $num) -}}
    {{- fail (printf "config.settings.%s[%d] must be an integer >= 1" $.path $idx) -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedTheme" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if kindIs "string" $v -}}
  {{- if eq $v "" -}}
    {{- fail (printf "config.settings.%s must not be empty" .path) -}}
  {{- end -}}
{{- else if kindIs "map" $v -}}
  {{- if eq (len $v) 0 -}}
    {{- fail (printf "config.settings.%s object must specify at least \"light\" or \"dark\"" .path) -}}
  {{- end -}}
  {{- range $tk, $tv := $v -}}
    {{- if not (has $tk (list "light" "dark")) -}}
      {{- fail (printf "config.settings.%s contains unsupported key %q; supported keys are \"light\" and \"dark\"" $.path $tk) -}}
    {{- end -}}
    {{- if or (not (kindIs "string" $tv)) (eq $tv "") -}}
      {{- fail (printf "config.settings.%s.%s must be a non-empty string" $.path $tk) -}}
    {{- end -}}
  {{- end -}}
{{- else -}}
  {{- fail (printf "config.settings.%s must be a non-empty string or theme object" .path) -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedNodeShellTerminal" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "map" $v) -}}
  {{- fail (printf "config.settings.%s must be an object" .path) -}}
{{- end -}}
{{- range $k, $subVal := $v -}}
  {{- if not (has $k (list "linuxImage" "namespace" "isEnabled")) -}}
    {{- fail (printf "config.settings.%s contains unsupported key %q" $.path $k) -}}
  {{- end -}}
  {{- $subPath := printf "%s.%s" $.path $k -}}
  {{- if eq $k "isEnabled" -}}
    {{- include "headlamp.validateWrappedBool" (dict "path" $subPath "val" $subVal) -}}
  {{- else -}}
    {{- include "headlamp.validateWrappedString" (dict "path" $subPath "val" $subVal "allowEmpty" true) -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedPodDebugTerminal" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "map" $v) -}}
  {{- fail (printf "config.settings.%s must be an object" .path) -}}
{{- end -}}
{{- range $k, $subVal := $v -}}
  {{- if not (has $k (list "debugImage" "isEnabled")) -}}
    {{- fail (printf "config.settings.%s contains unsupported key %q" $.path $k) -}}
  {{- end -}}
  {{- $subPath := printf "%s.%s" $.path $k -}}
  {{- if eq $k "isEnabled" -}}
    {{- include "headlamp.validateWrappedBool" (dict "path" $subPath "val" $subVal) -}}
  {{- else -}}
    {{- include "headlamp.validateWrappedString" (dict "path" $subPath "val" $subVal "allowEmpty" true) -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validateWrappedAppearance" -}}
{{- include "headlamp.validateAdminSettingsWrapper" . -}}
{{- $v := .val -}}
{{- if and (kindIs "map" $v) (hasKey $v "$value") -}}
  {{- $v = get $v "$value" -}}
{{- end -}}
{{- if not (kindIs "map" $v) -}}
  {{- fail (printf "config.settings.%s must be an object" .path) -}}
{{- end -}}
{{- range $k, $subVal := $v -}}
  {{- if not (has $k (list "accentColor" "icon")) -}}
    {{- fail (printf "config.settings.%s contains unsupported key %q" $.path $k) -}}
  {{- end -}}
  {{- include "headlamp.validateWrappedString" (dict "path" (printf "%s.%s" $.path $k) "val" $subVal "allowEmpty" true) -}}
{{- end -}}
{{- end }}

{{- define "headlamp.validatePluginValue" -}}
{{- $v := .val -}}
{{- if kindIs "map" $v -}}
  {{- if or (hasKey $v "$value") (hasKey $v "$display") (hasKey $v "$clusterDefined") -}}
    {{- include "headlamp.validateAdminSettingsWrapper" . -}}
  {{- else -}}
    {{- range $k, $subVal := $v -}}
      {{- include "headlamp.validatePluginValue" (dict "path" (printf "%s.%s" $.path $k) "val" $subVal) -}}
    {{- end -}}
  {{- end -}}
{{- else if not (or (kindIs "invalid" $v) (kindIs "string" $v) (kindIs "bool" $v) (kindIs "int" $v) (kindIs "int64" $v) (kindIs "float64" $v) (kindIs "slice" $v)) -}}
  {{- fail (printf "config.settings.%s has unsupported value type" .path) -}}
{{- end -}}
{{- end }}

{{/*
Resolve config.settings into a JSON object describing whether distributed
settings are enabled, whether an inline ConfigMap should be rendered, the
rendered settings JSON, any existingConfigMap/existingSecret reference, and
the key name inside the ConfigMap/Secret.
*/}}
{{- define "headlamp.settingsContext" -}}
{{- $raw := .Values.config.settings -}}
{{- $enabled := false -}}
{{- $inline := false -}}
{{- $json := "" -}}
{{- $existingConfigMap := "" -}}
{{- $existingSecret := "" -}}
{{- $key := "settings.json" -}}
{{- if not (empty $raw) -}}
  {{- if kindIs "string" $raw -}}
    {{- $trimmed := trim $raw -}}
    {{- if ne $trimmed "" -}}
      {{- $parsed := fromYaml $trimmed -}}
      {{- if and (kindIs "map" $parsed) (hasKey $parsed "Error") -}}
        {{- fail (printf "config.settings is not valid YAML/JSON: %s" $parsed.Error) -}}
      {{- end -}}
      {{- include "headlamp.validateAdminSettingsDoc" (dict "doc" $parsed) -}}
      {{- $enabled = true -}}
      {{- $inline = true -}}
      {{- $json = $parsed | toPrettyJson -}}
    {{- end -}}
  {{- else if kindIs "map" $raw -}}
    {{- $hasCM := hasKey $raw "existingConfigMap" -}}
    {{- $hasSec := hasKey $raw "existingSecret" -}}
    {{- $hasKey := hasKey $raw "key" -}}
    {{- if or $hasCM $hasSec $hasKey -}}
      {{- if and $hasCM $hasSec -}}
        {{- fail "config.settings cannot set both existingConfigMap and existingSecret" -}}
      {{- end -}}
      {{- if and (not $hasCM) (not $hasSec) -}}
        {{- fail "config.settings.key requires existingConfigMap or existingSecret" -}}
      {{- end -}}
      {{- if or (hasKey $raw "defaults") (hasKey $raw "clusterDefinedSettings") -}}
        {{- fail "config.settings cannot combine inline defaults/clusterDefinedSettings with existingConfigMap or existingSecret" -}}
      {{- end -}}
      {{- if $hasCM -}}
        {{- $existingConfigMap = $raw.existingConfigMap | toString -}}
        {{- if eq (trim $existingConfigMap) "" -}}
          {{- fail "config.settings.existingConfigMap must be non-empty" -}}
        {{- end -}}
      {{- end -}}
      {{- if $hasSec -}}
        {{- $existingSecret = $raw.existingSecret | toString -}}
        {{- if eq (trim $existingSecret) "" -}}
          {{- fail "config.settings.existingSecret must be non-empty" -}}
        {{- end -}}
      {{- end -}}
      {{- if $hasKey -}}
        {{- $key = $raw.key | toString -}}
        {{- if eq (trim $key) "" -}}
          {{- fail "config.settings.key must be non-empty" -}}
        {{- end -}}
      {{- end -}}
      {{- $enabled = true -}}
    {{- else -}}
      {{- include "headlamp.validateAdminSettingsDoc" (dict "doc" $raw) -}}
      {{- $enabled = true -}}
      {{- $inline = true -}}
      {{- $json = $raw | toPrettyJson -}}
    {{- end -}}
  {{- else -}}
    {{- fail "config.settings must be a YAML/JSON string or an object" -}}
  {{- end -}}
{{- end -}}
{{- dict "enabled" $enabled "inline" $inline "json" $json "existingConfigMap" $existingConfigMap "existingSecret" $existingSecret "key" $key | toJson -}}
{{- end }}
