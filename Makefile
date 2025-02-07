check: lint test

lint:
	./node_modules/.bin/biome ci

format:
	./node_modules/.bin/biome format --write

test:
	node --test $(TEST_OPTS)

test-cov: TEST_OPTS := --experimental-test-coverage
test-cov: test

distclean: clean
	rm -rf yarn.lock node_modules

.PHONY: check distclean format lint test test-cov
