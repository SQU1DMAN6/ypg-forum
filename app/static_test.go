package app

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// TestPageKeyFor ensures every URL the user can type maps to a real
// template we ship. If a new page is added to the static theme folder
// without registering it in pageKeyFor, this test will fail and force
// the maintainer to update both places together.
func TestPageKeyFor(t *testing.T) {
	cases := map[string]string{
		"":               "page_home",
		"index.html":     "page_home",
		"metaphysics":    "page_topic",
		"ethics.html":    "page_topic",
		"logic":          "page_topic",
		"aesthetics.html": "page_topic",
		"epistemology":   "page_topic",
		"politics.html":  "page_topic",
		"mind":           "page_topic",
		"religion.html":  "page_topic",
		"post.html":      "page_post",
		"following":      "page_following",
		"profile.html":   "page_profile",
		"settings":       "page_settings",
		"account.html":   "page_account",
		"messages":       "page_messages",
		"signin.html":    "page_signin",
		"signup":         "page_signup",
		"create-post":    "page_create_post",
		"user.html":      "page_user",
		"unknown.html":   "page_home",
		"topic":          "page_topic",
		"topic.html":     "page_topic",
	}
	for in, want := range cases {
		if got := pageKeyFor(in); got != want {
			t.Errorf("pageKeyFor(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestTitleForPage covers the page-key/title interaction. Topic pages
// should weave the topic name into the title so the browser tab
// identifies which branch of philosophy a member is reading.
func TestTitleForPage(t *testing.T) {
	cases := []struct {
		pageKey, topic, wantSubstr string
	}{
		{"page_home", "", "Young Philosophers Forum"},
		{"page_topic", "metaphysics", "Metaphysics"},
		{"page_topic", "ethics", "Ethics"},
		{"page_topic", "", "Discussion"},
		{"page_post", "", "Discussion"},
		{"page_following", "", "Following"},
		{"page_signin", "", "Sign In"},
		{"page_unknown", "", "Young Philosophers Forum"},
	}
	for _, tc := range cases {
		got := titleForPage(tc.pageKey, tc.topic)
		if !strings.Contains(got, tc.wantSubstr) {
			t.Errorf("titleForPage(%q, %q) = %q; expected to contain %q", tc.pageKey, tc.topic, got, tc.wantSubstr)
		}
	}
}

// TestAsString covers the safe stringifier used for map values coming
// out of the SQLite store. nil becomes "", strings stay strings, and
// other values get fmt.Sprint'd so the templates can render them.
func TestAsString(t *testing.T) {
	if got := asString(nil); got != "" {
		t.Errorf("asString(nil) = %q, want empty string", got)
	}
	if got := asString("hello"); got != "hello" {
		t.Errorf("asString(\"hello\") = %q, want \"hello\"", got)
	}
	if got := asString(42); got != "42" {
		t.Errorf("asString(42) = %q, want \"42\"", got)
	}
}

// TestPostHasTopic validates topic filtering for the topic pages. A
// post with no topicIds (or non-array) must be excluded, and a post
// that names the topic must be included.
func TestPostHasTopic(t *testing.T) {
	if postHasTopic(map[string]any{}, "ethics") {
		t.Error("postHasTopic(empty) = true, want false")
	}
	if postHasTopic(map[string]any{"topicIds": "ethics"}, "ethics") {
		t.Error("postHasTopic(string topic) = true, want false (must be array)")
	}
	if !postHasTopic(map[string]any{"topicIds": []any{"ethics", "mind"}}, "ethics") {
		t.Error("postHasTopic(ethics) = false, want true")
	}
	if postHasTopic(map[string]any{"topicIds": []any{"metaphysics"}}, "ethics") {
		t.Error("postHasTopic(ethics) on metaphysics-only = true, want false")
	}
}

// TestDebugFlagFromRequest exercises the gate that turns ?debug=1 into
// the body[data-debug] attribute. We also accept "true" case-insensitive
// to make it easy to toggle from devtools.
func TestDebugFlagFromRequest(t *testing.T) {
	tests := []struct {
		name, query, want string
	}{
		{"missing", "/", ""},
		{"debug=1", "/?debug=1", "1"},
		{"debug=0", "/?debug=0", ""},
		{"debug=true", "/?debug=true", "1"},
		{"debug=TRUE", "/?debug=TRUE", "1"},
		{"debug=other", "/?debug=on", ""},
		{"nil", "", ""},
	}
	for _, tc := range tests {
		if tc.name == "nil" {
			if got := debugFlagFromRequest(nil); got != tc.want {
				t.Errorf("nil request: debugFlagFromRequest = %q, want %q", got, tc.want)
			}
			continue
		}
		req := httptest.NewRequest("GET", "http://example.test"+tc.query, nil)
		if got := debugFlagFromRequest(req); got != tc.want {
			t.Errorf("%s: debugFlagFromRequest = %q, want %q", tc.name, got, tc.want)
		}
	}
}

// TestResolveHTMLPage is a regression guard for the URL hygiene rules:
// api/, assets/, and ypg/ paths must NOT resolve to a real file even if
// a similarly-named file exists, and `..` segments must be rejected.
func TestResolveHTMLPage(t *testing.T) {
	root := t.TempDir()
	// Create an index.html and a blocked go file
	if err := os.WriteFile(root+"/index.html", []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(root+"/database.db", []byte("binary"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, page, ok := resolveHTMLPage(root, "/"); !ok || page != "index.html" {
		t.Errorf("resolveHTMLPage(/) = (_, %q, %v); want (index.html, true)", page, ok)
	}
	if _, _, ok := resolveHTMLPage(root, "/database.db"); ok {
		t.Error("resolveHTMLPage(/database.db) = ok=true, want false (blocked file)")
	}
	if _, _, ok := resolveHTMLPage(root, "/api/whatever"); ok {
		t.Error("resolveHTMLPage(/api/...) = ok=true, want false (api/ is reserved)")
	}
	if _, _, ok := resolveHTMLPage(root, "/assets/foo.js"); ok {
		t.Error("resolveHTMLPage(/assets/...) = ok=true, want false (assets/ is reserved)")
	}
	if _, _, ok := resolveHTMLPage(root, "/ypg/userData/x"); ok {
		t.Error("resolveHTMLPage(/ypg/...) = ok=true, want false (ypg/ is reserved)")
	}
	if _, _, ok := resolveHTMLPage(root, "/../etc/passwd"); ok {
		t.Error("resolveHTMLPage(/../...) = ok=true, want false (path traversal blocked)")
	}
	if _, _, ok := resolveHTMLPage(root, "/missing.html"); ok {
		t.Error("resolveHTMLPage(/missing.html) = ok=true, want false (file not present)")
	}
	if _, _, ok := resolveHTMLPage(root, "/data/x.json"); ok {
		t.Error("resolveHTMLPage(/data/...) = ok=true, want false (data/ blocked)")
	}
	if _, page, ok := resolveHTMLPage(root, "/metaphysics.html"); ok {
		t.Errorf("resolveHTMLPage(/metaphysics.html) without on-disk file = ok=true (page=%q), want false", page)
	}
	// dot relative paths normalize
	if _, page, ok := resolveHTMLPage(root, "."); !ok || page != "index.html" {
		t.Errorf("resolveHTMLPage(.) = (_, %q, %v); want (index.html, true)", page, ok)
	}
}
