package app

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

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
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(body)
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
