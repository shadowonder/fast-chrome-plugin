package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func compactJSON(t *testing.T, text string) string {
	t.Helper()
	var out bytes.Buffer
	if err := json.Compact(&out, []byte(text)); err != nil {
		t.Fatalf("invalid result JSON: %v", err)
	}
	return out.String()
}

func TestAvroToPlain(t *testing.T) {
	tests := []struct{ name, input, want, prefix string }{
		{"string", `{"string":"hello"}`, `"hello"`, ""},
		{"pretty input", " \n" + `{ "z": { "long": 9007199254740993 }, "a": [ { "string": " x " } ] }` + "\t", `{"z":9007199254740993,"a":[" x "]}`, ""},
		{"escaped string", `{"string":"\u0061\n\\\/"}`, `"\u0061\n\\\/"`, ""},
		{"boolean", `{"boolean":false}`, `false`, ""},
		{"int", `{"int":-2147483648}`, `-2147483648`, ""},
		{"precise long", `{"long":9223372036854775807}`, `9223372036854775807`, ""},
		{"float spelling", `{"float":1.2300e-4}`, `1.2300e-4`, ""},
		{"precise double spelling", `{"double":1.234567890123456789e+100}`, `1.234567890123456789e+100`, ""},
		{"bytes are not base64 decoded", `{"bytes":"\u00ffabc"}`, `"\u00ffabc"`, ""},
		{"bare null", `null`, `null`, ""},
		{"compatible explicit null", `{"null":null}`, `null`, ""},
		{"array", `{"array":[{"long":9007199254740993},null,{"string":"x"}]}`, `[9007199254740993,null,"x"]`, ""},
		{"nested arrays", `{"array":[{"array":[{"string":"x"}]}]}`, `[["x"]]`, ""},
		{"map", `{"map":{"b":{"string":"x"},"a":{"int":2}}}`, `{"b":"x","a":2}`, ""},
		{"map entry is not a wrapper", `{"map":{"string":"business"}}`, `{"string":"business"}`, ""},
		{"nested maps", `{"map":{"outer":{"map":{"inner":{"boolean":true}}}}}`, `{"outer":{"inner":true}}`, ""},
		{"qualified record", `{"com.example.User":{"z":{"long":9007199254740993},"a":{"string":"A"}}}`, `{"z":9007199254740993,"a":"A"}`, "com.example."},
		{"lowercase qualified name", `{"com.example.record_type":{"id":{"int":1}}}`, `{"id":1}`, "com.example."},
		{"simple record and nested record", `{"model.UserRecord":{"detail":{"model.DetailRecord":{"value":{"string":"x"}}}}}`, `{"detail":{"value":"x"}}`, "model."},
		{"record field is not a wrapper", `{"User":{"string":"business"}}`, `{"string":"business"}`, "User"},
		{"simple enum", `{"Status":"READY"}`, `"READY"`, "Sta"},
		{"qualified enum", `{"com.example.Status":"READY"}`, `"READY"`, "com.example."},
		{"mixed record array map null", `{"items":{"array":[{"Thing":{"labels":{"map":{"key":{"string":"v"}}},"optional":null}}]}}`, `{"items":[{"labels":{"key":"v"},"optional":null}]}`, "Thing"},
		{"already plain JSON", `{"z":9007199254740993123456789,"a":[1.2300e+99,null,"x"]}`, `{"z":9007199254740993123456789,"a":[1.2300e+99,null,"x"]}`, ""},
		{"unknown single key", `{"customer":{"name":"Ada"}}`, `{"customer":{"name":"Ada"}}`, ""},
		{"unknown outer preserves structure but converts nested values", `{"payload":{"field":{"string":"x"}}}`, `{"payload":{"field":"x"}}`, ""},
		{"business object with multiple members", `{"string":"business","long":3}`, `{"string":"business","long":3}`, ""},
		{"lowercase and acronym names ambiguous", `[{"customer":"Ada"},{"URL":"example"},{"X":{"id":1}}]`, `[{"customer":"Ada"},{"URL":"example"},{"X":{"id":1}}]`, ""},
		{"duplicate and escaped keys retain order", `{"z":{"int":1},"\u0061":{"string":"x"},"z":{"int":2}}`, `{"z":1,"\u0061":"x","z":2}`, ""},
		{"ordinary scalar", `1.200e-3`, `1.200e-3`, ""},
		{"empty objects and arrays", `[{},{"array":[]},{"map":{}}]`, `[{},[],{}]`, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := (&StringService{}).Process(tt.input, "avro-to-plain", tt.prefix)
			if !got.Metadata.Success || got.Metadata.Operation != "avro-to-plain" || got.Metadata.Message == "" {
				t.Fatalf("unexpected outcome: %#v", got)
			}
			if compactJSON(t, got.Result) != tt.want {
				t.Fatalf("unexpected conversion:\n%s\nwant %s", got.Result, tt.want)
			}
			if len(got.Metadata.Warnings) == 0 || !strings.Contains(got.Metadata.Warnings[0], "best-effort") {
				t.Fatal("every schema-free conversion must report its limitations")
			}
		})
	}
}

func TestAvroPreservesIncompatibleWrappers(t *testing.T) {
	inputs := []string{
		`{"string":null}`, `{"boolean":1}`, `{"int":2147483648}`, `{"int":1.0}`,
		`{"long":9223372036854775808}`, `{"long":1e3}`, `{"float":1e100}`, `{"double":1e9999}`,
		`{"bytes":"世界"}`, `{"null":"null"}`, `{"array":{}}`, `{"map":[]}`,
		`{"User":123}`, `{"Status":"not an enum symbol"}`, `{"string":{"child":{"int":1}}}`,
	}
	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			prefix := ""
			if strings.HasPrefix(input, `{"User":`) {
				prefix = "User"
			}
			if strings.HasPrefix(input, `{"Status":`) {
				prefix = "Status"
			}
			got := (&StringService{}).Process(input, "avro-to-plain", prefix)
			if !got.Metadata.Success || compactJSON(t, got.Result) != input {
				t.Fatalf("incompatible/ambiguous object was changed: %#v", got)
			}
			if !strings.Contains(strings.Join(got.Metadata.Warnings, " "), "incompatible") {
				t.Fatal("preservation must include a warning")
			}
		})
	}
}

func TestAvroPreservesSchemaDefinitions(t *testing.T) {
	inputs := []string{
		`{"type":"record","name":"User","fields":[{"name":"value","type":["null","string"],"default":{"string":"keep"}}]}`,
		`{"com.example.User":{"type":"record","name":"User","fields":[]}}`,
		`{"schema":{"type":"enum","name":"Status","symbols":["READY"]}}`,
		`{"name":"field","type":"lowercase_type","default":{"string":"keep"}}`,
		`{"type":["null",{"type":"map","values":"string"}],"default":{"map":{"x":"y"}}}`,
	}
	for _, input := range inputs {
		got := (&StringService{}).Process(input, "avro-to-plain", "com.example.")
		if !got.Metadata.Success || compactJSON(t, got.Result) != input || !strings.Contains(strings.Join(got.Metadata.Warnings, " "), "schema-like") {
			t.Fatalf("schema content must be preserved and warned: %#v", got)
		}
	}
}

func TestAvroRejectsMalformedJSON(t *testing.T) {
	for _, input := range []string{"", " \n", "{", `{"long":`, `{"int":1,}`, `{}[]`, `{"array":[1,]}`, `{"string":"unterminated}`, "NaN"} {
		got := (&StringService{}).Process(input, "avro-to-plain", "")
		if got.Metadata.Success || got.Result != "" || !strings.Contains(got.Metadata.Message, "Invalid JSON") {
			t.Fatalf("malformed input must fail without output: %#v", got)
		}
	}
}

func TestAvroFormattingWarningsAndDepthLimit(t *testing.T) {
	got := (&StringService{}).Process(`{"int":1}`, "avro-to-plain", "")
	if got.Result != "1" {
		t.Fatal("scalar result must be plain JSON")
	}
	got = (&StringService{}).Process(`{"User":{"id":{"int":1}}}`, "avro-to-plain", "User")
	if got.Result != "{\n  \"id\": 1\n}" || !strings.Contains(strings.Join(got.Metadata.Warnings, " "), "named-type") {
		t.Fatalf("expected formatted record and named heuristic warning: %#v", got)
	}
	got = (&StringService{}).Process(strings.Repeat("[", 258)+"0"+strings.Repeat("]", 258), "avro-to-plain", "")
	if got.Metadata.Success || got.Result != "" || !strings.Contains(got.Metadata.Message, "256") {
		t.Fatal("excessive nesting must fail safely without output")
	}
	encoded, err := json.Marshal((&StringService{}).Process(`{"null":null}`, "avro-to-plain", ""))
	if err != nil || !bytes.Contains(encoded, []byte(`"warnings":`)) || !bytes.Contains(encoded, []byte(`compatibility convention`)) {
		t.Fatalf("warnings must cross the JSON metadata boundary: %s, %v", encoded, err)
	}
	legacy, err := json.Marshal((&StringService{}).Process("x", "identity", ""))
	if err != nil || bytes.Contains(legacy, []byte(`"warnings"`)) {
		t.Fatal("optional warnings must not change legacy outcomes")
	}
}

func TestAvroSyntaxErrorOffset(t *testing.T) {
	got := (&StringService{}).Process(`{"long":`, "avro-to-plain", "")
	if got.Metadata.Success || !strings.Contains(got.Metadata.Message, "byte 8:") {
		t.Fatalf("expected the actual EOF byte offset: %#v", got)
	}
}

func TestAvroNamespacePrefix(t *testing.T) {
	tests := []struct{ name, prefix, input, want string }{
		{"matching qualified record", "com.example.", `{"com.example.Address":{"street":{"string":"Main"}}}`, `{"street":"Main"}`},
		{"nonmatching object retains key", "com.example.", `{"org.other.Address":{"street":{"string":"Main"}}}`, `{"org.other.Address":{"street":"Main"}}`},
		{"empty prefix detects qualified names", "", `{"com.example.Address":{"id":{"int":1}}}`, `{"id":1}`},
		{"empty prefix restores simple-name heuristic", "", `{"Address":{"id":{"long":9007199254740993}}}`, `{"id":9007199254740993}`},
		{"empty prefix still converts primitive", "", `{"string":"hello"}`, `"hello"`},
		{"matching enum", "com.example.", `{"com.example.Status":"READY"}`, `"READY"`},
		{"nonmatching enum", "com.example.", `{"org.other.Status":"READY"}`, `{"org.other.Status":"READY"}`},
		{"literal dot is not wildcard", "com.example.", `{"comXexampleXAddress":{"id":{"int":1}}}`, `{"comXexampleXAddress":{"id":1}}`},
		{"literal metacharacters", "type[1]+.", `{"type[1]+.Address":{"id":{"int":1}}}`, `{"id":1}`},
		{"literal case sensitive", "Com.example.", `{"com.example.Address":{"id":{"int":1}}}`, `{"com.example.Address":{"id":1}}`},
		{"no prefix trimming", " com.example.", `{"com.example.Address":{"id":{"int":1}}}`, `{"com.example.Address":{"id":1}}`},
		{"no implicit namespace boundary", "com.example", `{"com.exampleExtra.Address":{"id":{"int":1}}}`, `{"id":1}`},
		{"explicit lowercase simple prefix", "addr", `{"address":{"id":{"int":1}}}`, `{"id":1}`},
		{"multiple keys never unwrap", "com.example.", `{"com.example.Address":{"id":{"int":1}},"extra":{"string":"keep"}}`, `{"com.example.Address":{"id":1},"extra":"keep"}`},
		{"matching business field name preserved", "com.example.", `{"com.example.Address":{"com.example.street":{"string":"Main"}}}`, `{"com.example.street":"Main"}`},
		{"matching map entry name preserved", "com.example.", `{"map":{"com.example.Address":{"string":"value"}}}`, `{"com.example.Address":"value"}`},
		{"nested mixed prefixes and containers", "com.example.", `{"array":[{"com.example.Person":{"address":{"com.example.Address":{"street":{"string":"Main"}}},"other":{"org.other.Status":"READY"}}},{"map":{"a":{"com.example.Status":"OK"}}}]}`, `[{"address":{"street":"Main"},"other":{"org.other.Status":"READY"}},{"a":"OK"}]`},
		{"matching prefix still checks value shape", "com.example.", `{"com.example.Address":123}`, `{"com.example.Address":123}`},
		{"matching prefix still protects schema", "com.example.", `{"com.example.Address":{"type":"record","name":"Address","fields":[]}}`, `{"com.example.Address":{"type":"record","name":"Address","fields":[]}}`},
		{"prefix does not gate primitives or containers", "does.not.match.", `{"array":[{"int":3},{"map":{"a":{"boolean":true}}}]}`, `[3,{"a":true}]`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := (&StringService{}).Process(tt.input, "avro-to-plain", tt.prefix)
			if !got.Metadata.Success || compactJSON(t, got.Result) != tt.want {
				t.Fatalf("unexpected prefix conversion: %#v; want %s", got, tt.want)
			}
			if tt.prefix == "" && !strings.Contains(strings.Join(got.Metadata.Warnings, " "), "automatic qualified/simple") {
				t.Fatal("automatic matching mode must be reported")
			}
		})
	}
}

func TestAvroAutomaticNamesAndExclusivePrefix(t *testing.T) {
	tests := []struct{ name, prefix, input, want string }{
		{"qualified lowercase type", "", `{"com.example.address":{"id":{"int":1}}}`, `{"id":1}`},
		{"simple enum", "", `{"Status":"READY"}`, `"READY"`},
		{"simple name with underscore", "", `{"Address_Record":{"id":{"int":1}}}`, `{"id":1}`},
		{"ordinary lowercase business object", "", `{"customer":{"id":{"int":1}}}`, `{"customer":{"id":1}}`},
		{"acronym business object", "", `{"URL":{"id":{"int":1}}}`, `{"URL":{"id":1}}`},
		{"single capital business object", "", `{"X":{"id":{"int":1}}}`, `{"X":{"id":1}}`},
		{"invalid name", "", `{"Address-Record":{"id":{"int":1}}}`, `{"Address-Record":{"id":1}}`},
		{"invalid record value", "", `{"Address":12}`, `{"Address":12}`},
		{"invalid enum symbol", "", `{"Status":"not a symbol"}`, `{"Status":"not a symbol"}`},
		{"prefix excludes simple heuristic", "com.example.", `{"Address":{"id":{"int":1}}}`, `{"Address":{"id":1}}`},
		{"prefix excludes qualified heuristic", "com.example.", `{"other.Address":{"id":{"int":1}}}`, `{"other.Address":{"id":1}}`},
		{"case mismatch does not fall back", "Com.example.", `{"com.example.Address":{"id":{"int":1}}}`, `{"com.example.Address":{"id":1}}`},
		{"nested automatic record array enum", "", `{"Record":{"items":{"array":[{"Detail":{"status":{"Status":"READY"}}}]}}}`, `{"items":[{"status":"READY"}]}`},
		{"automatic preserves record field names", "", `{"Record":{"Address":{"string":"business"}}}`, `{"Address":"business"}`},
		{"automatic preserves schema", "", `{"Address":{"type":"record","name":"Address","fields":[]}}`, `{"Address":{"type":"record","name":"Address","fields":[]}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := (&StringService{}).Process(tt.input, "avro-to-plain", tt.prefix)
			if !got.Metadata.Success || compactJSON(t, got.Result) != tt.want {
				t.Fatalf("unexpected matching mode result: %#v; want %s", got, tt.want)
			}
		})
	}
}

func TestAvroSwitchesMatchingModePerRequest(t *testing.T) {
	service := &StringService{}
	input := `{"a":{"com.example.Address":{"id":{"int":1}}},"b":{"Status":"READY"}}`
	for _, tt := range []struct{ prefix, want, warning string }{
		{"", `{"a":{"id":1},"b":"READY"}`, "automatic named-type heuristics"},
		{"com.example.", `{"a":{"id":1},"b":{"Status":"READY"}}`, "literal Namespace Prefix matching"},
		{"org.other.", `{"a":{"com.example.Address":{"id":1}},"b":{"Status":"READY"}}`, "best-effort"},
		{"", `{"a":{"id":1},"b":"READY"}`, "automatic named-type heuristics"},
	} {
		got := service.Process(input, "avro-to-plain", tt.prefix)
		if !got.Metadata.Success || compactJSON(t, got.Result) != tt.want || !strings.Contains(strings.Join(got.Metadata.Warnings, " "), tt.warning) {
			t.Fatalf("mode leaked between requests: %#v", got)
		}
		if strings.Contains(strings.Join(got.Metadata.Warnings, " "), "disabled") {
			t.Fatal("empty prefix must no longer report named conversion disabled")
		}
	}
}
