const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const connect = require('..');
const http = require('node:http');
const { makeFetch } = require('supertest-fetch');

describe('app', function () {
  let app;
  let request;

  beforeEach(function () {
    app = connect();
    request = makeFetch(http.createServer(app));
  });

  it('should inherit from event emitter', function (_, done) {
    app.on('foo', done);
    app.emit('foo');
  });

  it('should work in http.createServer', function () {
    app.use(function (req, res) {
      res.end('hello, world!');
    });
    return request('/').expectStatus(200).expectBody('hello, world!');
  });

  it('should be a callable function', function () {
    app.use(function (req, res) {
      res.end('hello, world!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res);
    }

    const server = http.createServer(handler);
    const request = makeFetch(server);

    return request('/').expectStatus(200).expectBody('oh, hello, world!');
  });

  it('should invoke callback if request not handled', function () {
    const app = connect();

    /* node:coverage disable */
    app.use('/foo', function () {
      assert.fail('should not be called');
    });
    /* node:coverage enable */

    function handler(req, res) {
      res.write('oh, ');
      app(req, res, function () {
        res.end('no!');
      });
    }

    const server = http.createServer(handler);
    const request = makeFetch(server);

    return request('/').expectStatus(200).expectBody('oh, no!');
  });

  it('should invoke callback on error', function () {
    const app = connect();

    app.use(function () {
      throw new Error('boom!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res, function (err) {
        res.end(err.message);
      });
    }

    const server = http.createServer(handler);
    const request = makeFetch(server);

    return request('/').expectStatus(200).expectBody('oh, boom!');
  });

  it('should work as middleware', function () {
    // custom server handler array
    const handlers = [
      connect(),
      function (req, res) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Ok');
      }
    ];

    // execute callbacks in sequence
    let n = 0;

    function run(req, res) {
      if (handlers[n]) {
        handlers[n++](req, res, function () {
          run(req, res);
        });
      }
    }

    // create a non-connect server
    const server = http.createServer(run);
    const request = makeFetch(server);

    return request('/').expectStatus(200).expectBody('Ok');
  });

  it('should work with multiple handlers pass to use()', function () {
    const result = [];
    app.use('/foo', a, b, [b, a], [a, [a, b]], b, function (req, res) {
      res.end(result.join(''));
    });
    return request('/foo').expectStatus(200).expectBody('abbaaabb');

    function a(req, res, next) {
      result.push('a');
      next();
    }

    function b(req, res, next) {
      result.push('b');
      next();
    }
  });

  it('should escape the 500 response body', function () {
    app.use(function (req, res, next) {
      next(new Error('error!'));
    });
    return request('/').expectStatus(500);
  });

  describe('404 handler', function () {
    it('should escape the 404 response body', function () {
      return request("/foo/<script>stuff'n</script>").expectStatus(404);
    });

    it('shoud not fire after headers sent', function () {
      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(next);
      });

      return request('/').expectStatus(200);
    });

    it('shoud have no body for HEAD', function () {
      return request('/', { method: 'HEAD' }).expectStatus(404).expectBody();
    });
  });

  describe('error handler', function () {
    it('should have escaped response body', function () {
      app.use(function () {
        throw new Error('<script>alert()</script>');
      });

      return request('/').expectStatus(500);
    });

    it('should use custom error code', function () {
      app.use(function (req, res, next) {
        next(503);
      });

      return request('/').expectStatus(503);
    });

    it('should keep error statusCode', function () {
      app.use(function (req, res, next) {
        res.statusCode = 503;
        next(403);
      });

      return request('/').expectStatus(503);
    });

    it('shoud not fire after headers sent', function () {
      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(function () {
          next(new Error('ack!'));
        });
      });

      return request('/').expectStatus(200);
    });

    it('shoud have no body for HEAD', function () {
      app.use(function () {
        throw new Error('ack!');
      });

      return request('/', { method: 'HEAD' }).expectStatus(500).expectBody();
    });
  });
});

describe('should work with async handlers', function () {
  it('should work with async/await', function () {
    const app = connect();

    app.use(async function (req, res) {
      await new Promise(resolve => {
        setTimeout(resolve, 1);
      });

      res.end('hello, world!');
    });
    const request = makeFetch(http.createServer(app));

    return request('/').expectStatus(200).expectBody('hello, world!');
  });

  it('should work with async/await error', function () {
    const app = connect();

    app.use(async function () {
      throw new Error('boom!');
    });

    const request = makeFetch(http.createServer(app));
    return request('/').expectStatus(500);
  });

  it('should work when handler returns rejected promise', function () {
    const app = connect();

    app.use(function () {
      return Promise.reject();
    });

    app.use(function (err, _req, res, _next) {
      res.end(err.message);
    });

    const request = makeFetch(http.createServer(app));
    return request('/').expectStatus(200).expectBody('Promise rejected.');
  });

  it('should call error handler after exception in async error handler', function () {
    const app = connect();

    app.use(async function () {
      throw new Error('boom! 1');
    });

    app.use(async function (err, _req, _res, _next) {
      assert.equal(err.message, 'boom! 1');
      throw new Error('boom! 2');
    });

    app.use(function (err, _req, res, _next) {
      res.end(err.message);
    });

    const request = makeFetch(http.createServer(app));
    return request('/').expectStatus(200).expectBody('boom! 2');
  });

  it('should work when error handler returns rejected promise', function () {
    const app = connect();

    app.use(async function () {
      throw new Error('boom! 1');
    });

    app.use(function (err, _req, _res, _next) {
      assert.equal(err.message, 'boom! 1');
      return Promise.reject();
    });

    app.use(function (err, _req, res, _next) {
      res.end(err.message);
    });

    const request = makeFetch(http.createServer(app));
    return request('/').expectStatus(200).expectBody('Promise rejected.');
  });
});
