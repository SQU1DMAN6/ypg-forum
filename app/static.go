package app

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"ftr-ypg/controller/login"
	"ftr-ypg/repository"
)

func RegisterStatic(r *chi.Mux) {
	workDir, err := os.Getwd()
	if err != nil {
		log.Fatalf("Error getting working directory: %v", err)
	}
	assetsPath := filepath.Join(projectRoot(workDir), "assets")
	userDataPath := filepath.Join(projectRoot(workDir), "ypg", "userData")
	checkDirExists(assetsPath, "assets")
	if err := os.MkdirAll(userDataPath, 0o755); err != nil {
		log.Printf("Warning: user data directory could not be created at %s", userDataPath)
	}
	fileServer := func(p string) http.Handler {
		fs := http.FileServer(http.Dir(p))
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			log.Printf("[static] %s %s -> %s", req.Method, req.URL.Path, p)
			fs.ServeHTTP(w, req)
		})
	}
	r.Handle("/assets/*", http.StripPrefix("/assets/", fileServer(assetsPath)))
	r.Handle("/ypg/userData/*", http.StripPrefix("/ypg/userData/", fileServer(userDataPath)))
}

// pageData is the data passed into the Go HTML templates when rendering a
// page server-side. We use it both for populating the feed and for the
// noscript/progressive-enhancement view.
type pageData struct {
	Title         string
	Description   string
	Page          string
	TopicID       string
	Path          string
	SignedIn      bool
	User          map[string]any
	Topics        []map[string]any
	Posts         []map[string]any
	Post          map[string]any
	Comments      []map[string]any
	Generated     string
	Debug         string
	FormError     string
	SignedInState string
	// DebugFlag is "1" when the visitor appended ?debug=1 to the URL. The
	// body tag carries it as data-debug so app.js can show the visible
	// YPG diagnostics panel without a second request. Empty string keeps
	// it hidden by default.
	DebugFlag string
}

// newBaseTemplate loads the layout, partials, and every page template from
// disk. We re-parse on every request so changes to the HTML are picked up
// without restarting the server. This is intentional: the previous regex
// injector was fragile and made the page hang on the JS-only render path.
// Now the page is fully rendered server-side, with the JS layer only doing
// progressive enhancement.
func newBaseTemplate() (*template.Template, error) {
	funcs := template.FuncMap{
		"defaultStr": func(args ...any) string {
			for _, a := range args {
				if a == nil {
					continue
				}
				if s, ok := a.(string); ok {
					if s != "" {
						return s
					}
					continue
				}
				return fmt.Sprint(a)
			}
			return ""
		},
		"titleCase": func(s string) string {
			if s == "" {
				return ""
			}
			return strings.ToUpper(s[:1]) + s[1:]
		},
	}
	dir := templateDir()
	patterns := []string{
		filepath.Join(dir, "layout.html"),
		filepath.Join(dir, "partials", "*.html"),
		filepath.Join(dir, "page_*.html"),
	}
	tpl := template.New("ypg").Funcs(funcs)
	for _, p := range patterns {
		matches, err := filepath.Glob(p)
		if err != nil {
			return nil, fmt.Errorf("glob %s: %w", p, err)
		}
		for _, m := range matches {
			if _, err := tpl.ParseFiles(m); err != nil {
				return nil, fmt.Errorf("parse %s: %w", m, err)
			}
		}
	}
	return tpl, nil
}

func templateDir() string {
	if d := os.Getenv("YPG_TEMPLATE_DIR"); d != "" {
		return d
	}
	// Templates live next to the app package. When the binary runs from the
	// repo root, this is `<root>/app/templates`. When installed, the user
	// can override with YPG_TEMPLATE_DIR.
	_, file, _, ok := runtime.Caller(0)
	if ok {
		return filepath.Join(filepath.Dir(file), "templates")
	}
	return filepath.Join("app", "templates")
}

// ServeHTMLPage resolves a request path to one of the HTML theme files and
// renders the page server-side using html/template. The rendered HTML
// contains the full navigation, topic sidebar, post list, and a real
// sign-in/sign-up topbar. JavaScript is then used purely for progressive
// enhancement (vote, follow, comment, message forms) so the page works
// even when scripts are blocked by an extension.
func ServeHTMLPage(w http.ResponseWriter, r *http.Request) {
	workDir, err := os.Getwd()
	if err != nil {
		http.Error(w, "could not resolve working directory", http.StatusInternalServerError)
		return
	}
	root := projectRoot(workDir)
	_, page, ok := resolveHTMLPage(root, r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	pageKey := pageKeyFor(page)

	topicFilter := strings.TrimSpace(r.URL.Query().Get("topic"))
	if topicFilter == "" && pageKey == "page_topic" {
		topicFilter = strings.TrimSuffix(strings.TrimSuffix(page, ".html"), "")
	}
	postID := strings.TrimSpace(r.URL.Query().Get("id"))
	userID := strings.TrimSpace(r.URL.Query().Get("user"))

	data := pageData{
		Page:        pageKey,
		TopicID:     topicFilter,
		Path:        r.URL.Path,
		Title:       titleForPage(pageKey, topicFilter),
		Description: descriptionForPage(pageKey, topicFilter),
		Generated:   time.Now().UTC().Format(time.RFC3339),
		DebugFlag:   debugFlagFromRequest(r),
	}

	if err := populatePageData(r, &data, pageKey, topicFilter, postID, userID); err != nil {
		log.Printf("[html] state load failed for %s: %v", r.URL.Path, err)
		data.Debug = fmt.Sprintf("state load error: %v", err)
	}

	tpl, err := newBaseTemplate()
	if err != nil {
		log.Printf("[html] template parse failed: %v", err)
		http.Error(w, "template parse failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var rendered strings.Builder
	if err := tpl.ExecuteTemplate(&rendered, pageKey, data); err != nil {
		log.Printf("[html] template execute failed for %s: %v", pageKey, err)
		http.Error(w, "template execute failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-YPG-Page", pageKey)
	w.Header().Set("X-YPG-Generated", data.Generated)
	log.Printf("[html] %s %s -> %s page=%s bytes=%d", r.Method, r.URL.Path, page, pageKey, rendered.Len())
	_, _ = w.Write([]byte(rendered.String()))
}

func populatePageData(r *http.Request, data *pageData, pageKey, topicFilter, postID, userID string) error {
	store := repository.GetStore()
	if store == nil {
		return fmt.Errorf("repository not initialized")
	}

	// Sign-in state
	uid := login.CurrentUserID(r)
	data.SignedIn = uid != ""
	data.SignedInState = "guest"
	data.User = map[string]any{
		"id":          "guest",
		"handle":      "guest",
		"name":        "YPG Member",
		"initials":    "YP",
		"avatarColor": "#27304f",
		"year":        "YPG",
		"bio":         "",
		"interests":   []any{},
	}
	if data.SignedIn {
		profile, _, err := store.AccountData(uid)
		if err == nil {
			data.User = profile
			data.SignedInState = "signed-in"
		}
	}

	// Topics (static list, also used by sidebar)
	data.Topics = []map[string]any{
		{"id": "metaphysics", "label": "Metaphysics", "color": "#f7d5d8", "description": "Reality, identity, time, free will, and what exists."},
		{"id": "ethics", "label": "Ethics", "color": "#d9f5cf", "description": "Right action, responsibility, harm, duty, and justice."},
		{"id": "logic", "label": "Logic", "color": "#faf5cf", "description": "Arguments, validity, fallacies, and clearer reasoning."},
		{"id": "aesthetics", "label": "Aesthetics", "color": "#d7ebff", "description": "Art, beauty, taste, creativity, and interpretation."},
		{"id": "epistemology", "label": "Epistemology", "color": "#ffe2bd", "description": "Knowledge, belief, evidence, doubt, and truth."},
		{"id": "politics", "label": "Politics", "color": "#d8dcff", "description": "Power, rights, law, citizenship, and social order."},
		{"id": "mind", "label": "Mind", "color": "#d7f6ef", "description": "Consciousness, personal identity, thought, and experience."},
		{"id": "religion", "label": "Religion", "color": "#eadcff", "description": "Faith, God, meaning, ritual, and religious argument."},
	}

	// Posts
	posts, err := store.Posts()
	if err != nil {
		return fmt.Errorf("posts: %w", err)
	}
	// Filter by topic for topic pages
	if pageKey == "page_topic" && topicFilter != "" {
		filtered := make([]map[string]any, 0, len(posts))
		for _, p := range posts {
			if postHasTopic(p, topicFilter) {
				filtered = append(filtered, p)
			}
		}
		posts = filtered
	}
	data.Posts = posts

	// Post detail
	if pageKey == "page_post" && postID != "" {
		for _, p := range posts {
			if asString(p["id"]) == postID {
				data.Post = p
				break
			}
		}
		if data.Post != nil {
			allComments, err := store.Comments()
			if err == nil {
				if rows, ok := allComments[postID]; ok {
					out := make([]map[string]any, 0, len(rows))
					for _, r := range rows {
						if m, ok := r.(map[string]any); ok {
							out = append(out, m)
						}
					}
					data.Comments = out
				}
			}
		}
	}

	// User profile page
	if pageKey == "page_user" && userID != "" {
		users, _ := store.Users()
		for _, u := range users {
			if asString(u["id"]) == userID {
				data.User = u
				break
			}
		}
	}

	return nil
}

func postHasTopic(post map[string]any, topic string) bool {
	ids, ok := post["topicIds"].([]any)
	if !ok {
		return false
	}
	for _, id := range ids {
		if asString(id) == topic {
			return true
		}
	}
	return false
}

func asString(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func pageKeyFor(page string) string {
	name := strings.TrimSuffix(strings.ToLower(page), ".html")
	switch name {
	case "index":
		return "page_home"
	case "metaphysics", "ethics", "logic", "aesthetics", "epistemology", "politics", "mind", "religion":
		return "page_topic"
	case "topic":
		return "page_topic"
	case "post":
		return "page_post"
	case "following":
		return "page_following"
	case "profile":
		return "page_profile"
	case "settings":
		return "page_settings"
	case "account":
		return "page_account"
	case "messages":
		return "page_messages"
	case "signin":
		return "page_signin"
	case "signup":
		return "page_signup"
	case "create-post":
		return "page_create_post"
	case "user":
		return "page_user"
	default:
		return "page_home"
	}
}

func titleForPage(pageKey, topic string) string {
	switch pageKey {
	case "page_home":
		return "Young Philosophers Forum"
	case "page_topic":
		if topic != "" {
			return titleCase(topic) + " | Young Philosophers Forum"
		}
		return "Discussion | Young Philosophers Forum"
	case "page_post":
		return "Discussion | Young Philosophers Forum"
	case "page_following":
		return "Following | Young Philosophers Forum"
	case "page_profile":
		return "Your Profile | Young Philosophers Forum"
	case "page_settings":
		return "Settings | Young Philosophers Forum"
	case "page_account":
		return "Account | Young Philosophers Forum"
	case "page_messages":
		return "Messages | Young Philosophers Forum"
	case "page_signin":
		return "Sign In | Young Philosophers Forum"
	case "page_signup":
		return "Sign Up | Young Philosophers Forum"
	case "page_create_post":
		return "Create Post | Young Philosophers Forum"
	case "page_user":
		return "Profile | Young Philosophers Forum"
	default:
		return "Young Philosophers Forum"
	}
}

func titleCase(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func descriptionForPage(pageKey, topic string) string {
	switch pageKey {
	case "page_home":
		return "Browse recent YPG questions, arguments, and ideas from MHS students."
	case "page_topic":
		for _, t := range []struct{ id, desc string }{
			{"metaphysics", "Reality, identity, time, free will, and what exists."},
			{"ethics", "Right action, responsibility, harm, duty, and justice."},
			{"logic", "Arguments, validity, fallacies, and clearer reasoning."},
			{"aesthetics", "Art, beauty, taste, creativity, and interpretation."},
			{"epistemology", "Knowledge, belief, evidence, doubt, and truth."},
			{"politics", "Power, rights, law, citizenship, and social order."},
			{"mind", "Consciousness, personal identity, thought, and experience."},
			{"religion", "Faith, God, meaning, ritual, and religious argument."},
		} {
			if t.id == topic {
				return t.desc
			}
		}
		return "Browse topic discussions."
	case "page_following":
		return "Posts from the people you follow."
	default:
		return ""
	}
}

func resolveHTMLPage(root, requestPath string) (filename string, page string, ok bool) {
	cleaned := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
	if cleaned == "" || cleaned == "." {
		cleaned = "index"
	}
	if strings.HasPrefix(cleaned, "api/") || strings.HasPrefix(cleaned, "assets/") || strings.HasPrefix(cleaned, "ypg/") {
		return "", "", false
	}

	ext := path.Ext(cleaned)
	if ext == "" {
		cleaned += ".html"
	} else if ext != ".html" {
		return "", "", false
	}

	blocked := map[string]bool{
		"database.db": true,
		"go.mod":      true,
		"go.sum":      true,
	}
	if blocked[cleaned] || strings.HasPrefix(cleaned, "data/") || strings.Contains(cleaned, "../") {
		return "", "", false
	}

	rel := filepath.FromSlash(cleaned)
	candidates := []string{
		filepath.Join(root, rel),
		filepath.Join(root, "view", "template", "themes", rel),
		filepath.Join(root, "themes", rel),
	}
	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return candidate, cleaned, true
		}
	}
	log.Printf("[html] no page for %q; tried %s", requestPath, strings.Join(candidates, ", "))
	return "", "", false
}

func checkDirExists(path string, name string) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("Warning: %s directory not found at %s", name, path)
	}
}

// debugFlagFromRequest returns "1" when the visitor appended ?debug=1 to
// the URL. The value is rendered into body[data-debug] so app.js can
// surface the diagnostics panel without a follow-up request. An empty
// string keeps the panel hidden by default.
func debugFlagFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	if v := strings.TrimSpace(r.URL.Query().Get("debug")); v == "1" || strings.EqualFold(v, "true") {
		return "1"
	}
	return ""
}

// projectRoot resolves the on-disk project root. It honours YPG_ROOT_DIR
// when set, then falls back to looking for index.html, themes/, or
// view/template/themes/ in the working directory, and finally in the
// parent of this file's package directory. The last fallback is safe to
// return -- callers tolerate the working directory when the layout
// looks atypical.
func projectRoot(workDir string) string {
	if root := strings.TrimSpace(os.Getenv("YPG_ROOT_DIR")); root != "" {
		return filepath.Clean(root)
	}
	if _, err := os.Stat(filepath.Join(workDir, "index.html")); err == nil {
		return workDir
	}
	if _, err := os.Stat(filepath.Join(workDir, "themes", "index.html")); err == nil {
		return workDir
	}
	if _, err := os.Stat(filepath.Join(workDir, "view", "template", "themes", "index.html")); err == nil {
		return workDir
	}
	_, file, _, ok := runtime.Caller(0)
	if ok {
		root := filepath.Dir(filepath.Dir(file))
		if _, err := os.Stat(filepath.Join(root, "index.html")); err == nil {
			return root
		}
		if _, err := os.Stat(filepath.Join(root, "themes", "index.html")); err == nil {
			return root
		}
		if _, err := os.Stat(filepath.Join(root, "view", "template", "themes", "index.html")); err == nil {
			return root
		}
	}
	return workDir
}
