package forum

import "testing"

// TestAsString is a regression guard for the local stringifier used
// inside Posts and Comments. The forum controller's asString is a
// string-only helper: it returns the input verbatim when given a
// string, and an empty string for anything else. The JSON body
// validation (title/body required) relies on this collapsing non-string
// payloads to "" so we can detect missing fields.
func TestAsString(t *testing.T) {
	if got := asString(nil); got != "" {
		t.Errorf("asString(nil) = %q, want empty", got)
	}
	if got := asString("hello"); got != "hello" {
		t.Errorf("asString(string) = %q, want %q", got, "hello")
	}
	// Non-string inputs collapse to "" so a JSON number or boolean
	// payload never passes the required-field check.
	if got := asString(7); got != "" {
		t.Errorf("asString(int) = %q, want empty", got)
	}
	if got := asString(true); got != "" {
		t.Errorf("asString(bool) = %q, want empty", got)
	}
}
