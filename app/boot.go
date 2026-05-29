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
	RegisterMiddleWares(r)
	RegisterStatic(r)
	routes.RegisterRoutes(r)
	r.Get("/", ServeHTMLPage)
	r.Get("/*", ServeHTMLPage)

	addr := os.Getenv("YPG_ADDR")
	if addr == "" {
		addr = ":13300"
	}
	top := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path == "/" {
			ServeHTMLPage(w, req)
			return
		}
		r.ServeHTTP(w, req)
	})

	if err := http.ListenAndServe(addr, top); err != nil {
		panic(err)
	}
}
