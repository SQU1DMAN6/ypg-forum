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
	// Session middleware runs first so CurrentUserID() works in
	// downstream handlers and template rendering. scs.LoadAndSave is
	// already the cheapest path the library exposes; it only writes back
	// to the disk store when the session was actually mutated.
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

	if err := http.ListenAndServe(addr, r); err != nil {
		panic(err)
	}
}
