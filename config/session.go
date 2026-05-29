package config

import (
	"net/http"
	"path/filepath"
	"time"

	"github.com/alexedwards/scs/v2"
)

var sessionManager *scs.SessionManager

func InitSession() error {
	store, err := NewDiskSessionStore(filepath.Join("data", "sessions", "sessions.db"), time.Minute)
	if err != nil {
		return err
	}
	sessionManager = scs.New()
	sessionManager.Store = store
	sessionManager.Lifetime = 24 * 90 * time.Hour
	sessionManager.Cookie.Name = "ypg_session"
	sessionManager.Cookie.HttpOnly = true
	sessionManager.Cookie.Persist = true
	sessionManager.Cookie.Path = "/"
	sessionManager.Cookie.SameSite = http.SameSiteStrictMode
	sessionManager.Cookie.Secure = false
	return nil
}

func GetSessionManager() *scs.SessionManager {
	return sessionManager
}
