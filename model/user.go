package model

type User struct {
	ID           string
	Handle       string
	Email        string
	PasswordHash string
	ProfileJSON  string
	SettingsJSON string
	CreatedAt    string
}
