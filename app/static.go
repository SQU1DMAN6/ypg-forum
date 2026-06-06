package app

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"regexp"
	tmpl "html/template"

	"github.com/go-chi/chi/v5"
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
	fileServer := func(path string) http.Handler {
		fs := http.FileServer(http.Dir(path))
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			fs.ServeHTTP(w, r)
		})
	}
	r.Handle("/assets/*", http.StripPrefix("/assets/", fileServer(assetsPath)))
	r.Handle("/ypg/userData/*", http.StripPrefix("/ypg/userData/", fileServer(userDataPath)))
}

func ServeHTMLPage(w http.ResponseWriter, r *http.Request) {
	workDir, err := os.Getwd()
	if err != nil {
		http.Error(w, "could not resolve working directory", http.StatusInternalServerError)
		return
	}
	root := projectRoot(workDir)
	path := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if path == "." || path == "" {
		path = "index.html"
	}
	if strings.HasPrefix(path, "..") || strings.HasPrefix(path, "data/") || path == "database.db" || path == "go.mod" || path == "go.sum" {
		http.NotFound(w, r)
		return
	}
	if filepath.Ext(path) != ".html" {
		http.NotFound(w, r)
		return
	}
	filename := filepath.Join(root, path)
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		filename = filepath.Join(root, "view", "template", "themes", path)
	}
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		filename = filepath.Join(root, "themes", path)
	}
	body, err := os.ReadFile(filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Attempt to provide a minimal server-side-rendered shell inside the
	// <div id="app"> container so pages are usable when JavaScript is
	// blocked. We perform a safe string replacement rather than full
	// templating to keep changes minimal.
	enhanced, err := injectServerShell(body, r)
	if err != nil {
		// If the injection fails, fall back to the original body.
		enhanced = body
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(enhanced)
}

// injectServerShell returns HTML with a server-rendered fallback injected
// into the #app container. This provides a progressive enhancement so that
// critical navigation and a small topic list are visible when JavaScript is
// unavailable or blocked by extensions.
func injectServerShell(body []byte, r *http.Request) ([]byte, error) {
	// Conservative regex to locate the opening <div id="app" ...> and its
	// closing tag. Use (?s) so '.' matches newlines. Do not be greedy.
	re := regexp.MustCompile(`(?s)(<div\s+id=\"app\"[^>]*>)(.*?)(</div>)`)
	if !re.Match(body) {
		return body, nil
	}

	// Build a minimal HTML shell showing navigation and topics.
	topics := []struct{
		ID string
		Label string
	}{
		{"metaphysics", "Metaphysics"},
		{"ethics", "Ethics"},
		{"logic", "Logic"},
		{"aesthetics", "Aesthetics"},
		{"epistemology", "Epistemology"},
		{"politics", "Politics"},
		{"mind", "Mind"},
		{"religion", "Religion"},
	}

	var b strings.Builder
	b.WriteString("<div id=\"app\">\n  <main class=\"main noscript-main\">\n    <header><h1>Young Philosophers Forum</h1></header>\n    <section class=\"content-panel\">\n      <h2>Topics</h2>\n      <ul class=\"topic-list-noscript\">\n")
	for _, t := range topics {
		b.WriteString("        <li><a href=\"")
		b.WriteString(tmpl.HTMLEscapeString(t.ID))
		b.WriteString(".html\">")
		b.WriteString(tmpl.HTMLEscapeString(t.Label))
		b.WriteString("</a></li>\n")
	}
	b.WriteString("      </ul>\n      <p class=\"quiet\">This is a lightweight fallback view. Enable JavaScript for full functionality.</p>\n    </section>\n  </main>\n</div>")

	// Replace the matched #app content with our server shell.
	out := re.ReplaceAll(body, []byte("${1}"+b.String()+"${3}"))
	return out, nil
}

func checkDirExists(path string, name string) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("Warning: %s directory not found at %s", name, path)
	}
}

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
