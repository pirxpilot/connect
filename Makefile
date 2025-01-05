check: lint test

lint:
	node_modules/.bin/jshint index.js test

test:
	node --test

test-cov:
	node --experimental-test-coverage --test

distclean: clean
	rm -rf yarn.lock node_modules

.PHONY: check lint test test-cov distclean
