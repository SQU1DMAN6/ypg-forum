package repository

type State struct {
	Users         []map[string]any    `json:"users"`
	Posts         []map[string]any    `json:"posts"`
	Comments      map[string][]any    `json:"comments"`
	Follows       map[string][]string `json:"follows"`
	Votes         map[string]any      `json:"votes"`
	Profiles      map[string]any      `json:"profiles"`
	Settings      map[string]any      `json:"settings"`
	Conversations []map[string]any    `json:"conversations"`
}
