package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/template"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"sigs.k8s.io/yaml"
)

type TemplateContext struct {
	Value  interface{}
	Claims map[string]interface{}
}

// ExtractClaims extracts the claims from a JWT bearer token.
func ExtractClaims(token string) (map[string]interface{}, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format, expected 3 parts")
	}

	return DecodeBase64JSON(parts[1])
}

// ParseRules parses mapping rules from a raw JSON/YAML string or a file path.
func ParseRules(rulesStr, rulesFile string) ([]config.MappingRule, error) {
	var (
		rules   []config.MappingRule
		rawData []byte
	)

	switch {
	case rulesFile != "":
		data, err := os.ReadFile(rulesFile) //nolint:gosec
		if err != nil {
			return nil, fmt.Errorf("reading rules file: %w", err)
		}

		rawData = data
	case rulesStr != "":
		rawData = []byte(rulesStr)
	default:
		return nil, nil
	}

	// Try parsing as JSON first, fallback to YAML
	if err := json.Unmarshal(rawData, &rules); err == nil {
		return rules, nil
	}

	if err := yaml.Unmarshal(rawData, &rules); err != nil {
		return nil, fmt.Errorf("unmarshaling rules as JSON/YAML: %w", err)
	}

	return rules, nil
}

func getRuleValues(rule config.MappingRule, claims map[string]interface{}) ([]interface{}, bool) {
	if rule.FromClaim == "" {
		return []interface{}{nil}, true
	}

	claimVal, exists := claims[rule.FromClaim]
	if !exists {
		return nil, false
	}

	if sliceVal, ok := claimVal.([]interface{}); ok {
		return sliceVal, true
	}

	if strSliceVal, ok := claimVal.([]string); ok {
		values := make([]interface{}, len(strSliceVal))
		for i, v := range strSliceVal {
			values[i] = v
		}

		return values, true
	}

	return []interface{}{claimVal}, true
}

// EvaluateRules evaluates identity mapping rules against validated OIDC claims.
// It returns the impersonated user (must resolve to exactly one) and a list of groups.
func EvaluateRules(rules []config.MappingRule, claims map[string]interface{}) (string, []string, error) {
	var (
		user   string
		groups []string
	)

	for _, rule := range rules {
		values, exists := getRuleValues(rule, claims)
		if !exists {
			continue
		}

		// Compile the Go template
		tmpl, err := template.New("rule").Parse(rule.Template)
		if err != nil {
			return "", nil, fmt.Errorf("parsing template %q failed: %w", rule.Template, err)
		}

		for _, val := range values {
			var buf bytes.Buffer

			ctx := TemplateContext{
				Value:  val,
				Claims: claims,
			}
			if err := tmpl.Execute(&buf, ctx); err != nil {
				return "", nil, fmt.Errorf("evaluating template failed: %w", err)
			}

			rendered := buf.String()
			if rendered == "" {
				continue
			}

			switch rule.Target {
			case "user":
				if user != "" {
					return "", nil, fmt.Errorf("multiple mapping rules resolved to Impersonate-User; must resolve to exactly one")
				}

				user = rendered
			case "group":
				groups = append(groups, rendered)
			}
		}
	}

	return user, groups, nil
}
