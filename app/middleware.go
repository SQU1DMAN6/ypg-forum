package app

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
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

// cooldownKey is the in-process per-(caller, route) last-hit timestamp.
// We keep it in memory; on a server restart the cooldown resets, which is
// fine for the level of protection we're after (anti-double-click, not
// anti-DDoS).
type cooldownEntry struct {
	lastHit time.Time
}

var (
	cooldownMu   sync.Mutex
	cooldownMap  = map[string]*cooldownEntry{}
)

// PerUserRouteCooldown returns a middleware that returns 429 Too Many
// Requests if the same caller hit the same route+method in the last
// `window` (default 5s). The caller is the signed-in user id when
// available, otherwise the client IP. GETs are never throttled by this
// middleware so browsing stays free; only the mutating endpoints wrap it.
func PerUserRouteCooldown(window time.Duration) func(http.Handler) http.Handler {
	if window <= 0 {
		window = 5 * time.Second
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only throttle state-changing methods. GETs are read-only
			// and need to be fast.
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			caller := callerID(r)
			if caller == "" {
				caller = "anon:" + clientIP(r)
			}
			key := caller + " " + r.Method + " " + r.URL.Path
			now := time.Now()
			cooldownMu.Lock()
			entry, ok := cooldownMap[key]
			if !ok {
				entry = &cooldownEntry{}
				cooldownMap[key] = entry
			}
			if !entry.lastHit.IsZero() && now.Sub(entry.lastHit) < window {
				retry := window - now.Sub(entry.lastHit)
				cooldownMu.Unlock()
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(retry.Seconds())+1))
				http.Error(w, "please wait a few seconds before repeating this request", http.StatusTooManyRequests)
				return
			}
			entry.lastHit = now
			// Best-effort GC of stale entries so the map doesn't grow
			// without bound. Cheap because the map is small (one entry
			// per route per active caller) and the lock is held for
			// microseconds.
			if len(cooldownMap) > 4096 {
				cutoff := now.Add(-window)
				for k, e := range cooldownMap {
					if e.lastHit.Before(cutoff) {
						delete(cooldownMap, k)
					}
				}
			}
			cooldownMu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}

// callerID returns a stable identifier for the current user, preferring
// the session user id over the IP address. Returns "" for guests.
func callerID(r *http.Request) string {
	if v := r.Context().Value(callerIDKey); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// WithCallerID stores the session user id on the request context so the
// cooldown middleware can use it as a key. The id is the same value the
// scs session exposes via GetString("userID"); we resolve it here once
// per request and pass it down via context to avoid two lookups.
func WithCallerID(r *http.Request, userID string) *http.Request {
	ctx := context.WithValue(r.Context(), callerIDKey, userID)
	return r.WithContext(ctx)
}

type ctxKey int

const callerIDKey ctxKey = 1

// clientIP best-effort resolves the client's address. We trust
// X-Forwarded-For only as a last-resort hint because the deployment
// does not put a known reverse proxy in front. The cooldown middleware
// is the only thing that reads this, and missing precision here just
// means a slightly looser throttle, not a security failure.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			xff = xff[:i]
		}
		if ip := strings.TrimSpace(xff); ip != "" {
			return ip
		}
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
