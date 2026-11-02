.PHONY: build lint test check spec-addresses

build:
	npm run build

lint:
	npm run lint

test:
	npm test

check:
	npm run check --silent

spec-addresses:
	bin/spec_addresses.py
