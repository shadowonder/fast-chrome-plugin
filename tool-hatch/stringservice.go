package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// StringService owns all string transformations exposed to the frontend.
type StringService struct{}

// StringResponse is the stable Wails response envelope, including on failure.
type StringResponse struct {
	Result   string         `json:"result"`
	Metadata StringMetadata `json:"metadata"`
}

// StringMetadata describes the operation outcome. Preserve these fields when
// adding optional content information (e.g. JSON detection or format details).
// Warnings describe schema-free conversion limits. Other content-analysis
// fields may be added later without changing the required outcome fields.
type StringMetadata struct {
	Operation string   `json:"operation"`
	Success   bool     `json:"success"`
	Message   string   `json:"message"`
	Warnings  []string `json:"warnings,omitempty"`
}

func (s *StringService) Process(input string, operation string, namespacePrefix string) StringResponse {
	response := StringResponse{
		Metadata: StringMetadata{Operation: operation},
	}
	switch operation {
	case "identity":
		response.Result = input
	case "trim":
		response.Result = strings.TrimSpace(input)
	case "uppercase":
		response.Result = strings.ToUpper(input)
	case "lowercase":
		response.Result = strings.ToLower(input)
	case "avro-to-plain":
		result, warnings, err := avroToPlain(input, namespacePrefix)
		if err != nil {
			response.Metadata.Message = err.Error()
			return response
		}
		response.Result = result
		response.Metadata.Warnings = warnings
		response.Metadata.Success = true
		response.Metadata.Message = "Avro JSON converted using schema-free best-effort rules."
		return response
	case "json-format":
		// Indent validates one complete JSON value without decoding it into Go
		// values. This preserves member order, numeric literals and string escapes.
		// Future Avro normalization is separate; do not rewrite schema content here.
		var formatted bytes.Buffer
		if err := json.Indent(&formatted, []byte(input), "", "  "); err != nil {
			response.Metadata.Message = "Invalid JSON: " + err.Error()
			if syntax, ok := err.(*json.SyntaxError); ok {
				response.Metadata.Message = fmt.Sprintf("Invalid JSON at byte %d: %s", syntax.Offset, syntax.Error())
			}
			return response
		}
		response.Result = strings.TrimRight(formatted.String(), " \t\r\n")
	default:
		response.Metadata.Message = fmt.Sprintf("Unsupported operation: %q", operation)
		return response
	}
	response.Metadata.Success = true
	response.Metadata.Message = "String processed successfully."
	if operation == "json-format" {
		response.Metadata.Message = "JSON formatted successfully."
	}
	return response
}
