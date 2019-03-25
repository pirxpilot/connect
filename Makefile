check: lint test

lint:
	eslint .

test:
	mocha --require test/support/env --reporter spec --bail --check-leaks test

test-cov:
	nyc --reporter=text $(MAKE) test

test-travis:
	nyc --reporter=html --reporter=text $(MAKE) test

.PHONY: check lint test test-cov test-travis
