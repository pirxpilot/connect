check: lint test

lint:
	node_modules/.bin/jshint index.js test

test:
	mocha --require test/support/env --reporter spec --bail --check-leaks test

test-cov:
	nyc --reporter=text $(MAKE) test

test-travis:
	nyc --reporter=html --reporter=text $(MAKE) test

clean:
	rm -rf .nyc_output coverage

distclean: clean
	rm -rf yarn.lock node_modules

.PHONY: check lint test test-cov test-travis clean distclean
