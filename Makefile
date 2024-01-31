check: lint test

lint:
	node_modules/.bin/jshint index.js test

test:
	node --require ./test/support/env.js --test

test-cov:
	node --require ./test/support/env.js --experimental-test-coverage --test

distclean: clean
	rm -rf yarn.lock node_modules

.PHONY: check lint test test-cov distclean
