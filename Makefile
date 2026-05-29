.PHONY: dev

dev:
	go run cmd/main.go

build:
	go build -o ./bin/ftr-ypg ./cmd

run:
	chmod 755 ./bin/ftr-ypg
	./bin/ftr-ypg

create:
	sudo mkdir -p bin
	sudo chmod 7777 bin

reload:
	sudo systemctl daemon-reload

start:
	sudo systemctl start ftr-ypg

enable:
	sudo systemctl enable ftr-ypg

stop:
	sudo systemctl stop ftr-ypg

restart:
	sudo systemctl restart ftr-ypg

status:
	sudo systemctl status ftr-ypg

log:
	journalctl -u ftr-ypg -ftr

pull:
	git pull

update: pull build reload restart status log