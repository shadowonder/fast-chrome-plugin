package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Raw members retain order, duplicate keys and exact scalar/number spellings.
// No schema is resolved: recognition below is deliberately heuristic.
type avroMember struct {
	name  string
	key   json.RawMessage
	value json.RawMessage
}

type avroConversion struct {
	namespacePrefix                                         string
	unwrapped, named, ambiguous, mismatched, schemas, nulls int
}

var avroIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
var avroSimpleName = regexp.MustCompile(`^[A-Z][A-Za-z0-9_]*$`)
var avroQualifiedName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$`)

func avroToPlain(input string, namespacePrefix string) (string, []string, error) {
	var original json.RawMessage
	if err := json.Unmarshal([]byte(input), &original); err != nil {
		if syntax, ok := err.(*json.SyntaxError); ok {
			return "", nil, fmt.Errorf("Invalid JSON at byte %d: %s", syntax.Offset, syntax.Error())
		}
		return "", nil, fmt.Errorf("Invalid JSON: %w", err)
	}
	conversion := &avroConversion{namespacePrefix: namespacePrefix}
	plain, err := conversion.convert(original, false, 0)
	if err != nil {
		return "", nil, err
	}
	var formatted bytes.Buffer
	if err := json.Indent(&formatted, plain, "", "  "); err != nil {
		return "", nil, fmt.Errorf("Cannot format converted JSON: %w", err)
	}
	warnings := []string{fmt.Sprintf("Removed %d wrapper(s). Schema-free best-effort conversion: type-shaped business objects may be misidentified; this is not full Avro deserialization.", conversion.unwrapped)}
	if namespacePrefix == "" {
		warnings = append(warnings, "Namespace Prefix is empty; automatic qualified/simple named-type detection is active.")
	}
	if conversion.named > 0 {
		rule := "literal Namespace Prefix matching"
		if namespacePrefix == "" {
			rule = "automatic named-type heuristics"
		}
		warnings = append(warnings, fmt.Sprintf("Unwrapped %d named-type wrapper(s) using %s and value-shape checks.", conversion.named, rule))
	}
	if conversion.ambiguous > 0 {
		warnings = append(warnings, fmt.Sprintf("Preserved %d ambiguous single-key object(s).", conversion.ambiguous))
	}
	if conversion.mismatched > 0 {
		warnings = append(warnings, fmt.Sprintf("Preserved %d type-shaped object(s) with incompatible values, including their contents.", conversion.mismatched))
	}
	if conversion.schemas > 0 {
		warnings = append(warnings, fmt.Sprintf("Preserved %d schema-like object(s) without converting their contents.", conversion.schemas))
	}
	if conversion.nulls > 0 {
		warnings = append(warnings, "Unwrapped explicit null wrappers as a compatibility convention; standard Avro encodes null directly.")
	}
	return formatted.String(), warnings, nil
}

func avroMembers(raw []byte) ([]avroMember, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	var members []avroMember
	for decoder.More() {
		start := decoder.InputOffset()
		key, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		// Token may consume a preceding comma. Keep the original quoted key.
		keyRaw := bytes.TrimLeft(raw[start:decoder.InputOffset()], ", \t\r\n")
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		members = append(members, avroMember{name: key.(string), key: keyRaw, value: value})
	}
	return members, nil
}

func (c *avroConversion) convert(raw []byte, container bool, depth int) ([]byte, error) {
	if depth > 256 {
		return nil, fmt.Errorf("Conversion nesting exceeds the supported limit of 256 levels")
	}
	switch raw[0] {
	case '[':
		var items []json.RawMessage
		if err := json.Unmarshal(raw, &items); err != nil {
			return nil, err
		}
		var out bytes.Buffer
		out.WriteByte('[')
		for i, item := range items {
			converted, err := c.convert(item, false, depth+1)
			if err != nil {
				return nil, err
			}
			if i > 0 {
				out.WriteByte(',')
			}
			out.Write(converted)
		}
		out.WriteByte(']')
		return out.Bytes(), nil
	case '{':
		members, err := avroMembers(raw)
		if err != nil {
			return nil, err
		}
		if avroSchemaLike(members) {
			c.schemas++
			return raw, nil
		}
		if !container && len(members) == 1 {
			member := members[0]
			known, matches := avroWrapper(member.name, member.value, c.namespacePrefix)
			if known && !matches {
				c.mismatched++
				return raw, nil
			}
			if matches {
				// A named schema-definition entry is not a record data wrapper.
				if member.value[0] == '{' {
					payload, err := avroMembers(member.value)
					if err != nil {
						return nil, err
					}
					if avroSchemaLike(payload) {
						c.schemas++
						return raw, nil
					}
				}
				c.unwrapped++
				if avroNamedType(member.name, c.namespacePrefix) {
					c.named++
				}
				if member.name == "null" {
					c.nulls++
				}
				// Record/map payloads are containers, not another union envelope.
				// Their field/map-entry values are still converted recursively.
				return c.convert(member.value, member.value[0] == '{', depth+1)
			}
			c.ambiguous++
		}
		var out bytes.Buffer
		out.WriteByte('{')
		for i, member := range members {
			value, err := c.convert(member.value, false, depth+1)
			if err != nil {
				return nil, err
			}
			if i > 0 {
				out.WriteByte(',')
			}
			out.Write(member.key)
			out.WriteByte(':')
			out.Write(value)
		}
		out.WriteByte('}')
		return out.Bytes(), nil
	default:
		return raw, nil
	}
}

func avroNamedType(name, namespacePrefix string) bool {
	// Reserved labels continue to use their existing primitive/container rules.
	switch name {
	case "null", "boolean", "int", "long", "float", "double", "bytes", "string", "array", "map":
		return false
	default:
		// A configured prefix is exclusive: never fall back to name heuristics.
		if namespacePrefix != "" {
			return strings.HasPrefix(name, namespacePrefix)
		}
		// Restore the original narrow schema-free patterns, not arbitrary keys.
		return avroQualifiedName.MatchString(name) ||
			(avroSimpleName.MatchString(name) && strings.ContainsAny(name, "abcdefghijklmnopqrstuvwxyz"))
	}
}

func avroWrapper(name string, value []byte, namespacePrefix string) (known, matches bool) {
	switch name {
	case "null":
		return true, string(value) == "null"
	case "boolean":
		return true, string(value) == "true" || string(value) == "false"
	case "string":
		return true, value[0] == '"'
	case "bytes":
		var text string
		if json.Unmarshal(value, &text) != nil || value[0] != '"' {
			return true, false
		}
		for _, character := range text {
			if character > 255 {
				return true, false
			}
		}
		return true, true
	case "int", "long":
		bits := 64
		if name == "int" {
			bits = 32
		}
		_, err := strconv.ParseInt(string(value), 10, bits)
		return true, err == nil
	case "float", "double":
		bits := 64
		if name == "float" {
			bits = 32
		}
		// Validate the range without writing a rounded floating-point value.
		_, err := strconv.ParseFloat(string(value), bits)
		return true, err == nil && (value[0] == '-' || value[0] >= '0' && value[0] <= '9')
	case "array":
		return true, value[0] == '['
	case "map":
		return true, value[0] == '{'
	default:
		if !avroNamedType(name, namespacePrefix) {
			return false, false
		}
		if value[0] == '{' {
			return true, true
		}
		var symbol string
		return true, value[0] == '"' && json.Unmarshal(value, &symbol) == nil && avroIdentifier.MatchString(symbol)
	}
}

func avroSchemaLike(members []avroMember) bool {
	for _, member := range members {
		if member.name != "type" {
			continue
		}
		if member.value[0] == '[' {
			return true // Conservatively preserve possible union schema objects.
		}
		var name string
		if json.Unmarshal(member.value, &name) == nil &&
			(avroIdentifier.MatchString(name) || avroQualifiedName.MatchString(name)) {
			return true // Also protect unqualified lowercase schema references.
		}
	}
	return false
}
