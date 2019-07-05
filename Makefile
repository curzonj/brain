default:
	(cd .. && npx eslint -f unix --fix src/*.js src/**/*.js client/views/*.js client/stores/*.js client/lib/*.js)
