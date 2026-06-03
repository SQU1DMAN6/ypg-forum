package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type RateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{hits: map[string][]time.Time{}, limit: limit, window: window}
}

func (r *RateLimiter) Allow(req *http.Request) bool {
	host := req.Header.Get("X-Forwarded-For")
	if host != "" {
		host = strings.TrimSpace(strings.Split(host, ",")[0])
	}
	if host == "" {
		host = req.Header.Get("X-Real-IP")
	}
	if host == "" {
		var err error
		host, _, err = net.SplitHostPort(req.RemoteAddr)
		if err != nil {
			host = req.RemoteAddr
		}
	}
	now := time.Now()
	cutoff := now.Add(-r.window)
	r.mu.Lock()
	defer r.mu.Unlock()
	var kept []time.Time
	for _, hit := range r.hits[host] {
		if hit.After(cutoff) {
			kept = append(kept, hit)
		}
	}
	if len(kept) >= r.limit {
		r.hits[host] = kept
		return false
	}
	r.hits[host] = append(kept, now)
	return true
}
