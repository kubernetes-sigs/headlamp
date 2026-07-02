package auth_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
)

func getTestRules() []config.MappingRule {
	return []config.MappingRule{
		{
			Target:    "user",
			FromClaim: "sub",
			Template:  "headlamp:user:{{.Value}}",
		},
		{
			Target:    "group",
			FromClaim: "groups",
			Template:  "headlamp:group:{{.Value}}",
		},
		{
			Target:   "group",
			Template: "headlamp:authenticated",
		},
	}
}

func TestEvaluateRules_Valid(t *testing.T) {
	rules := getTestRules()
	claims := map[string]interface{}{
		"sub":    "12345",
		"groups": []string{"admin", "dev"},
	}

	user, groups, err := auth.EvaluateRules(rules, claims)
	assert.NoError(t, err)
	assert.Equal(t, "headlamp:user:12345", user)
	assert.ElementsMatch(t, []string{"headlamp:group:admin", "headlamp:group:dev", "headlamp:authenticated"}, groups)
}

func TestEvaluateRules_MissingClaim(t *testing.T) {
	rules := getTestRules()
	claims := map[string]interface{}{
		"sub": "12345",
	}

	user, groups, err := auth.EvaluateRules(rules, claims)
	assert.NoError(t, err)
	assert.Equal(t, "headlamp:user:12345", user)
	assert.ElementsMatch(t, []string{"headlamp:authenticated"}, groups)
}

func TestEvaluateRules_Nested(t *testing.T) {
	customRules := []config.MappingRule{
		{
			Target:    "user",
			FromClaim: "sub",
			Template:  "headlamp:user:{{.Claims.tenant_id}}:{{.Value}}",
		},
	}

	claims := map[string]interface{}{
		"sub":       "12345",
		"tenant_id": "acme",
	}

	user, groups, err := auth.EvaluateRules(customRules, claims)
	assert.NoError(t, err)
	assert.Equal(t, "headlamp:user:acme:12345", user)
	assert.Empty(t, groups)
}

func TestEvaluateRules_MultipleUsers(t *testing.T) {
	badRules := []config.MappingRule{
		{
			Target:    "user",
			FromClaim: "sub",
			Template:  "headlamp:user:{{.Value}}",
		},
		{
			Target:    "user",
			FromClaim: "email",
			Template:  "headlamp:user:{{.Value}}",
		},
	}

	claims := map[string]interface{}{
		"sub":   "12345",
		"email": "user@example.com",
	}

	_, _, err := auth.EvaluateRules(badRules, claims)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "multiple mapping rules resolved to Impersonate-User")
}

func TestParseRules_JSON(t *testing.T) {
	jsonStr := `[
		{"target": "user", "fromClaim": "sub", "template": "user:{{.Value}}"},
		{"target": "group", "fromClaim": "groups", "template": "group:{{.Value}}"}
	]`
	rules, err := auth.ParseRules(jsonStr, "")
	assert.NoError(t, err)
	assert.Len(t, rules, 2)
	assert.Equal(t, "user", rules[0].Target)
	assert.Equal(t, "sub", rules[0].FromClaim)
	assert.Equal(t, "user:{{.Value}}", rules[0].Template)
}

func TestParseRules_YAML(t *testing.T) {
	yamlStr := `
- target: user
  fromClaim: sub
  template: user:{{.Value}}
- target: group
  fromClaim: groups
  template: group:{{.Value}}
`
	rules, err := auth.ParseRules(yamlStr, "")
	assert.NoError(t, err)
	assert.Len(t, rules, 2)
	assert.Equal(t, "group", rules[1].Target)
	assert.Equal(t, "groups", rules[1].FromClaim)
}
