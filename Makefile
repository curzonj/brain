.PHONY: test lint

test:
	npx tsc
	npx react-scripts test --watchAll=false

lint:
	npx tsc
	npx eslint --fix './src/**/*.{ts,tsx}'
	# complete

rewrite:
	# STARTING
	kbase rewrite fixQueues
	# DONE
