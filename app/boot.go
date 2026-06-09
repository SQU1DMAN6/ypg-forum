package app

import (
	routes "ftr-ypg"
	"net/http"
	"os"

	"ftr-ypg/config"
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
	ss := config.GetSessionManager()
	r.Use(ss.LoadAndSave)
	r.Use(PanicRecoveryMiddleware)
	RegisterMiddleWares(r)
	RegisterStatic(r)
	routes.RegisterRoutes(r)
	r.Get("/", ServeHTMLPage)
	r.Get("/*", ServeHTMLPage)

	addr := os.Getenv("YPG_ADDR")
	if addr == "" {
		addr = ":13300"
	}

	// All requests, including the root, must go through the chi router so
	// that the session middleware (ss.LoadAndSave) runs and populates the
	// request context. Earlier we short-circuited / to ServeHTMLPage before
	// the session was loaded, which caused a panic in login.CurrentUserID
	// ("scs: no session data in context") and returned an empty reply to
	// the browser -- which is exactly the hang the user reported.
	if err := http.ListenAndServe(addr, r); err != nil {
		panic(err)
	}
}
