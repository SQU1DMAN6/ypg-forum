package favicon

import "net/http"

func Favicon(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}

	iconPath := "./assets/img/ypg-logo.png"

	http.ServeFile(w, r, iconPath)
}
