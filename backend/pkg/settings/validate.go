/*
Copyright 2026 The Kubernetes Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Package settings validates Headlamp distributed admin settings documents.
package settings

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed settings.schema.json
var schemaBytes []byte

var (
	compiledOnce   sync.Once
	compiledSchema *jsonschema.Schema
	compileErr     error
)

func getSchema() (*jsonschema.Schema, error) {
	compiledOnce.Do(func() {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
		if err != nil {
			compileErr = fmt.Errorf("parsing embedded settings schema: %w", err)
			return
		}

		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft7)

		if err := compiler.AddResource("settings.schema.json", doc); err != nil {
			compileErr = fmt.Errorf("registering settings schema: %w", err)
			return
		}

		compiledSchema, compileErr = compiler.Compile("settings.schema.json")
	})

	return compiledSchema, compileErr
}

// Validate checks that data is syntactically valid JSON and conforms to the
// Headlamp admin settings schema.
func Validate(data []byte) error {
	if !json.Valid(data) {
		return errors.New("settings file is not valid JSON")
	}

	schema, err := getSchema()
	if err != nil {
		return err
	}

	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("settings file is not valid JSON: %w", err)
	}

	if err := schema.Validate(instance); err != nil {
		return fmt.Errorf("settings file failed schema validation: %w", err)
	}

	return nil
}
