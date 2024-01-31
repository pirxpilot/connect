const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const connect = require('..');
const http = require('http');
const request = require('supertest');

describe('app', function () {
  let app;

  beforeEach(function () {
    app = connect();
  });

  it('should inherit from event emitter', function (_, done) {
    app.on('foo', done);
    app.emit('foo');
  });

  it('should work in http.createServer', function (_, done) {
    const app = connect();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    const server = http.createServer(app);

    request(server)
      .get('/')
      .expect(200, 'hello, world!', done);
  });

  it('should be a callable function', function (_, done) {
    const app = connect();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res);
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(200, 'oh, hello, world!', done);
  });

  it('should invoke callback if request not handled', function (_, done) {
    const app = connect();

    app.use('/foo', function (req, res) {
      res.end('hello, world!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res, function () {
        res.end('no!');
      });
    }

    const server = http.createServer(handler);

    request(server)
      .get('/')
      .expect(200, 'oh, no!', done);
  });

  it('should invoke callback on error', function (_, done) {
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

    request(server)
      .get('/')
      .expect(200, 'oh, boom!', done);
  });

  it('should work as middleware', function (_, done) {
    // custom server handler array
    const handlers = [connect(), function (req, res) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Ok');
    }];

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

    request(server)
      .get('/')
      .expect(200, 'Ok', done);
  });

  it('should escape the 500 response body', function (_, done) {
    app.use(function (req, res, next) {
      next(new Error('error!'));
    });
    request(app)
      .get('/')
      .expect(500, done);
  });

  describe('404 handler', function () {
    it('should escape the 404 response body', function (_, done) {
      request(app)
        .get('/foo/<script>stuff\'n</script>')
        .expect(404, done);
    });

    it('shoud not fire after headers sent', function (_, done) {
      const app = connect();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(next);
      });

      request(app)
        .get('/')
        .expect(200, done);
    });

    it('shoud have no body for HEAD', function (_, done) {
      const app = connect();

      request(app)
        .head('/')
        .expect(404)
        .expect(shouldHaveNoBody())
        .end(done);
    });
  });

  describe('error handler', function () {
    it('should have escaped response body', function (_, done) {
      const app = connect();

      app.use(function () {
        throw new Error('<script>alert()</script>');
      });

      request(app)
        .get('/')
        .expect(500, done);
    });

    it('should use custom error code', function (_, done) {
      const app = connect();

      app.use(function (req, res, next) {
        next(503);
      });

      request(app)
        .get('/')
        .expect(503, done);
    });

    it('should keep error statusCode', function (_, done) {
      const app = connect();

      app.use(function (req, res, next) {
        res.statusCode = 503;
        next(403);
      });

      request(app)
        .get('/')
        .expect(503, done);
    });

    it('shoud not fire after headers sent', function (_, done) {
      const app = connect();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(function () {
          next(new Error('ack!'));
        });
      });

      request(app)
        .get('/')
        .expect(200, done);
    });

    it('shoud have no body for HEAD', function (_, done) {
      const app = connect();

      app.use(function () {
        throw new Error('ack!');
      });

      request(app)
        .head('/')
        .expect(500)
        .expect(shouldHaveNoBody())
        .end(done);
    });
  });
});

function shouldHaveNoBody() {
  return function (res) {
    assert.ok(res.text === '' || res.text === undefined);
  };
}
