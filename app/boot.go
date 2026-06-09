package app

import (
	routes "ftr-ypg"
	"net/http"
	"os"
	"time"

	"ftr-ypg/config"
	"ftr-ypg/controller/login"
	"ftr-ypg/repository"

	"github.com/go-chi/chi/v5"
)

type Application struct {
	DB       *config.Database
	Sessions *config.DiskSessionStore
	Store    *repository.Store
}

func BootApp() {
	db, err := config.OpenDatabase("database.db")
	if err != nil {
		panic(err)
	}
	store := repository.NewStore(db.SQL)
	repository.SetStore(store)
	if err := store.EnsureSeedData(); err != nil {
		panic(err)
	}
	if err := config.InitSession(); err != nil {
		panic(err)
	}

	r := chi.NewRouter()
	// Session middleware runs first so CurrentUserID() works in
	// downstream handlers and template rendering.
	ss := config.GetSessionManager()
	r.Use(ss.LoadAndSave)
	r.Use(PanicRecoveryMiddleware)
	RegisterMiddleWares(r)
	RegisterStatic(r)
	routes.RegisterRoutes(r)
	r.Get("/", ServeHTMLPage)
	r.Get("/*", ServeHTMLPage)

	// Per-user 5-second cooldown on the mutating API endpoints only.
	// GETs and the HTML page routes stay unthrottled so browsing stays
	// free. The session user id is resolved here (after LoadAndSave) and
	// attached to the context so the middleware can use it as a key.
	r.Group(func(api chi.Router) {
		api.Use(callerIDMiddleware)
		api.Use(PerUserRouteCooldown(5 * time.Second))
		// Register the mutating endpoints on the throttled sub-router
		// by walking the patterns registered by routes.RegisterRoutes
		// and re-binding them. We call RegisterMutatingRoutes for that.
		routes.RegisterMutatingRoutes(api)
	})

	addr := os.Getenv("YPG_ADDR")
	if addr == "" {
		addr = ":13300"
	}

	if err := http.ListenAndServe(addr, r); err != nil {
		panic(err)
	}
}

// callerIDMiddleware pulls the current session user id (if any) and
// attaches it to the request context under a private key. The cooldown
// middleware uses this id as its rate-limit key so two anonymous
// browsers sharing a NAT don't accidentally throttle each other.
func callerIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, WithCallerID(r, login.CurrentUserID(r)))
	})
}
