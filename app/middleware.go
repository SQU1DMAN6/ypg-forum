package app

import (
	"bufio"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func RegisterMiddleWares(r *chi.Mux) {
	r.Use(RequestBodyLogger)
	r.Use(StatsMiddleware)
	r.Use(SecureHeaders)
	r.Use(middleware.Logger)
	r.Use(middleware.StripSlashes)
}

type responseRecorder struct {
	http.ResponseWriter
	status  int
	written int64
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.written += int64(n)
	return n, err
}

func (r *responseRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

func StatsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rr := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rr, r)
		elapsed := time.Since(start)
		println("[stats]", r.Method, r.URL.Path, "status", rr.status, "bytes", rr.written, "elapsed", elapsed.String())
	})
}

func SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		csp := strings.Join([]string{
			"default-src 'self';",
			"script-src 'self';",
			"script-src-elem 'self';",
			"style-src 'self' 'unsafe-inline';",
			"style-src-elem 'self' 'unsafe-inline';",
			"img-src 'self' data: blob: https:;",
			"font-src 'self' data:;",
			"connect-src 'self';",
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

func RequestBodyLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > 0 {
			println("[req]", r.Method, r.URL.String(), "body len", r.ContentLength)
		}
		next.ServeHTTP(w, r)
	})
}
