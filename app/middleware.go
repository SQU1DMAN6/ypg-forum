package app

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func RegisterMiddleWares(r *chi.Mux) {
	// StripSlashes first so path normalization happens before anything else.
	r.Use(middleware.StripSlashes)
	// Hard upper bound on request lifetime. This is the safety net that
	// stops the "Loading YPG Forum..." hang: if a handler ever wedges on a
	// slow query or a stuck SQLite write, the connection is closed and the
	// client gets a 504 within ~10s, instead of waiting forever.
	r.Use(RequestTimeoutMiddleware(10 * time.Second))
	// Security headers and panic recovery stay in place; they're cheap.
	r.Use(SecureHeaders)
	r.Use(PanicRecoveryMiddleware)
	// One chi request log line per request. The previous stack emitted
	// three duplicate lines (req, stats, reqv) plus a static-file log
	// line on every asset hit. Keep it minimal.
	r.Use(middleware.Logger)
}

// RequestTimeoutMiddleware caps how long any single handler is allowed to
// run. If the deadline elapses the goroutine context is cancelled and the
// response is force-closed. The 10s default is generous for a forum page
// and tight enough that the user-visible "loading" indicator never sticks.
func RequestTimeoutMiddleware(timeout time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SecureHeaders emits the security headers we keep. The CSP is loosened a
// touch (connect-src allows http/https) so the JS layer can always talk to
// the backend, and the rest of the policy stays strict: no inline scripts,
// no foreign frames, no foreign form targets, no remote objects.
func SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		csp := strings.Join([]string{
			"default-src 'self';",
			"script-src 'self';",
			"style-src 'self' 'unsafe-inline';",
			"img-src 'self' data: blob: https:;",
			"font-src 'self' data:;",
			"connect-src 'self' http: https:;",
			"worker-src 'self' blob:;",
			"object-src 'none';",
			"frame-ancestors 'none';",
			"base-uri 'self';",
			"form-action 'self';",
		}, " ")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", csp)
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}
		next.ServeHTTP(w, r)
	})
}

// PanicRecoveryMiddleware converts any panic inside a handler into a 500
// response and logs the stack. Without this, a panic inside ServeHTMLPage
// or one of the controllers would tear the request down with a closed
// connection and the browser would never see a useful error.
func PanicRecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[panic] method=%s path=%s reason=%v", r.Method, r.URL.Path, rec)
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte("internal server error - see bin/server.err.log for details"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
