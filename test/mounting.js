const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const connect = require('..');
const http = require('node:http');
const { makeFetch } = require('supertest-fetch');

/* jshint unused:vars */

describe('app.use()', function () {
  let app;
  let request;

  beforeEach(function () {
    app = connect();
    request = makeFetch(http.createServer(app));
  });

  it('should match all paths with "/"', function () {
    app.use('/', function (req, res) {
      res.end(req.url);
    });

    return request('/blog').expectStatus(200).expectBody('/blog');
  });

  it('should match full path', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request('/blog').expectStatus(200).expectBody('/');
  });

  it('should match left-side of path', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request('/blog/article/1')
      .expectStatus(200)
      .expectBody('/article/1');
  });

  it('should match up to dot', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request('/blog.json').expectStatus(200);
  });

  it('should not match shorter path', function () {
    app.use('/blog-o-rama', function (req, res) {
      res.end(req.url);
    });

    return request('/blog').expect(404);
  });

  it('should not end match in middle of component', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request('/blog-o-rama/article/1').expect(404);
  });

  it('should be case insensitive (lower-case route, mixed-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/blog', blog);

    return request('/BLog').expectBody('blog');
  });

  it('should be case insensitive (mixed-case route, lower-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    return request('/blog').expectBody('blog');
  });

  it('should be case insensitive (mixed-case route, mixed-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    return request('/blOG').expectBody('blog');
  });

  it('should ignore fn.arity > 4', function () {
    const invoked = [];

    app.use(function (_req, _res, next, _a, _b) {
      invoked.push(0);
      next();
    });
    app.use(function (_req, _res, next) {
      invoked.push(1);
      next(new Error('err'));
    });
    app.use(function (_err, _req, res, _next) {
      invoked.push(2);
      res.end(invoked.join(','));
    });

    return request('/').expectStatus(200).expectBody('1,2');
  });

  describe('with a connect app', function () {
    it('should mount', function () {
      const blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      return request('/blog').expectStatus(200).expectBody('blog');
    });

    it('should retain req.originalUrl', function () {
      app.use('/blog', function (req, res) {
        res.end(req.originalUrl);
      });

      return request('/blog/post/1')
        .expectStatus(200)
        .expectBody('/blog/post/1');
    });

    it('should adjust req.url', function () {
      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      return request('/blog/post/1').expectStatus(200).expectBody('/post/1');
    });

    it('should strip trailing slash', function () {
      const blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog/', blog);

      return request('/blog').expectBody('blog');
    });

    it('should not add trailing slash to req.url', function () {
      app.use('/admin', function (req, res, next) {
        next();
      });

      app.use(function (req, res, _next) {
        res.end(req.url);
      });

      return request('/admin').expectBody('/admin');
    });
  });

  describe('with a node app', function () {
    it('should mount', function () {
      const blog = http.createServer(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      return request('/blog').expectBody('blog');
    });
  });

  describe('error handling', function () {
    it('should send errors to airty 4 fns', function () {
      app.use(function (_req, _res, next) {
        next(new Error('msg'));
      });
      app.use(function (err, _req, res, _next) {
        res.end('got error ' + err.message);
      });

      return request('/').expectBody('got error msg');
    });

    it('should skip to non-error middleware', function () {
      let invoked = false;

      app.use(function (_req, _res, next) {
        next(new Error('msg'));
      });
      app.use(function (_req, _res, next) {
        invoked = true;
        next();
      });
      app.use(function (err, _req, res, _next) {
        res.end(invoked ? 'invoked' : err.message);
      });

      return request('/').expectStatus(200).expectBody('msg');
    });

    it('should start at error middleware declared after error', function () {
      app.use(function (err, _req, res, _next) {
        res.end('fail: ' + err.message);
      });
      app.use(function (_req, _res, next) {
        next(new Error('boom!'));
      });
      app.use(function (err, _req, res, _next) {
        res.end('pass: ' + err.message);
      });

      return request('/').expectStatus(200).expectBody('pass: boom!');
    });

    it('should stack error fns', function () {
      app.use(function (req, res, next) {
        next(new Error('msg'));
      });
      app.use(function (err, _req, res, next) {
        res.setHeader('X-Error', err.message);
        next(err);
      });
      app.use(function (err, _req, res, _next) {
        res.end('got error ' + err.message);
      });

      return request('/')
        .expectHeader('X-Error', 'msg')
        .expectStatus(200)
        .expectBody('got error msg');
    });

    it('should invoke error stack even when headers sent', async function () {
      let invoked = false;
      app.use(function (req, res, next) {
        res.end('0');
        next(new Error('msg'));
      });
      app.use(function (_err, _req, _res, _next) {
        invoked = true;
      });

      await request('/');
      assert.ok(invoked, 'error handler invoked');
    });
  });
});
