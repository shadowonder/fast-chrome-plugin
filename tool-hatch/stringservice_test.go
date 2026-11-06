package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestProcess(t *testing.T) {
	service := &StringService{}
	tests := []struct {
		name, input, operation, want string
		success                      bool
	}{
		{"identity preserves whitespace", " \tHello\n世界 \x00", "identity", " \tHello\n世界 \x00", true},
		{"unicode trim", "\u2003 \tHello\n world \n\u00a0", "trim", "Hello\n world", true},
		{"uppercase unicode", "héllo 世界", "uppercase", "HÉLLO 世界", true},
		{"lowercase unicode", "HÉLLO 世界", "lowercase", "héllo 世界", true},
		{"empty input succeeds", "", "uppercase", "", true},
		{"whitespace becomes empty", " \n\t", "trim", "", true},
		{"unknown operation", "keep this", "reverse", "", false},
		{"missing operation", "hello", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := service.Process(tt.input, tt.operation, "")
			if got.Result != tt.want || got.Metadata.Success != tt.success || got.Metadata.Operation != tt.operation {
				t.Fatalf("unexpected response: %#v", got)
			}
			if got.Metadata.Message == "" {
				t.Fatal("metadata must always explain the outcome")
			}
			if !tt.success && !strings.Contains(got.Metadata.Message, "Unsupported operation:") {
				t.Fatalf("missing failure reason: %q", got.Metadata.Message)
			}
		})
	}
}

func TestResponseJSONContract(t *testing.T) {
	for _, operation := range []string{"identity", "unknown"} {
		response := (&StringService{}).Process("", operation, "")
		encoded, err := json.Marshal(response)
		if err != nil {
			t.Fatal(err)
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &envelope); err != nil {
			t.Fatal(err)
		}
		if string(envelope["result"]) != `""` {
			t.Fatalf("empty result must be present as a string: %s", encoded)
		}
		var metadata map[string]json.RawMessage
		if err := json.Unmarshal(envelope["metadata"], &metadata); err != nil {
			t.Fatal(err)
		}
		for _, field := range []string{"operation", "success", "message"} {
			if _, present := metadata[field]; !present {
				t.Fatalf("missing required metadata field %s: %s", field, encoded)
			}
		}
	}
}

func TestJSONFormat(t *testing.T) {
	service := &StringService{}
	input := `  {"z":1,"a":[true,null,{"text":"hello"}]}  `
	want := "{\n  \"z\": 1,\n  \"a\": [\n    true,\n    null,\n    {\n      \"text\": \"hello\"\n    }\n  ]\n}"
	got := service.Process(input, "json-format", "")
	if !got.Metadata.Success || got.Result != want || got.Metadata.Operation != "json-format" || got.Metadata.Message == "" {
		t.Fatalf("unexpected JSON formatting response: %#v", got)
	}
}

func TestJSONFormatPreservesTokens(t *testing.T) {
	inputs := []string{
		`{"z":9007199254740993123456789,"a":1.2300e+45,"negative":-0,"duplicate":1,"duplicate":2}`,
		`{"escaped":"\u0061\n\"\\\/","unicode":"世界","nested":[{"b":2,"a":1},[],{}]}`,
		`{"type":"record","name":"Item","doc":"Keep me","fields":[{"name":"id","type":"long","default":0}]}`,
		`[true,false,null," text ",3.14]`,
		`null`, `true`, `"a string"`, `1.200e-3`,
	}
	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			got := (&StringService{}).Process(input, "json-format", "")
			if !got.Metadata.Success {
				t.Fatalf("valid JSON rejected: %#v", got)
			}
			var before, after bytes.Buffer
			if err := json.Compact(&before, []byte(input)); err != nil {
				t.Fatal(err)
			}
			if err := json.Compact(&after, []byte(got.Result)); err != nil {
				t.Fatal(err)
			}
			if before.String() != after.String() {
				t.Fatalf("formatting changed JSON tokens: %s -> %s", input, got.Result)
			}
			if twice := (&StringService{}).Process(got.Result, "json-format", ""); !twice.Metadata.Success || twice.Result != got.Result {
				t.Fatal("formatting must be idempotent")
			}
		})
	}
}

func TestJSONFormatRejectsMalformedInput(t *testing.T) {
	inputs := []string{"", " \t\n", "{", "[1,", `{"a":`, `{"a":1,}`, `{"a":1} trailing`, "true false", "01", "NaN", "\"unclosed", "\"line\nbreak\"", "{}\u00a0"}
	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			got := (&StringService{}).Process(input, "json-format", "")
			if got.Metadata.Success || got.Result != "" || got.Metadata.Operation != "json-format" || !strings.Contains(got.Metadata.Message, "Invalid JSON") {
				t.Fatalf("expected failed JSON outcome without output: %#v", got)
			}
		})
	}
}
