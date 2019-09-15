.PHONY: test

test:
	npx tsc
	npx react-scripts test --watchAll=false

lint:
	# -f unix --fix
	npx eslint './src/**/*.{ts,tsx}'
