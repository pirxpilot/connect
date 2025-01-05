const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const connect = require('..');
const http = require('http');
const request = require('supertest');

/* jshint unused:vars */

describe('app.use()', function () {
  let app;

  beforeEach(function () {
    app = connect();
  });

  it('should match all paths with "/"', function () {
    app.use('/', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog')
      .expect(200, '/blog');
  });

  it('should match full path', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog')
      .expect(200, '/');
  });

  it('should match left-side of path', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog/article/1')
      .expect(200, '/article/1');
  });

  it('should match up to dot', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog.json')
      .expect(200);
  });

  it('should not match shorter path', function () {
    app.use('/blog-o-rama', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog')
      .expect(404);
  });

  it('should not end match in middle of component', function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    return request(app)
      .get('/blog-o-rama/article/1')
      .expect(404);
  });

  it('should be case insensitive (lower-case route, mixed-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/blog', blog);

    return request(app)
      .get('/BLog')
      .expect('blog');
  });

  it('should be case insensitive (mixed-case route, lower-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    return request(app)
      .get('/blog')
      .expect('blog');
  });

  it('should be case insensitive (mixed-case route, mixed-case request)', function () {
    const blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    return request(app)
      .get('/blOG')
      .expect('blog');
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

    return request(app)
      .get('/')
      .expect(200, '1,2');
  });

  describe('with a connect app', function () {
    it('should mount', function () {
      const blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      return request(app)
        .get('/blog')
        .expect(200, 'blog');
    });

    it('should retain req.originalUrl', function () {
      const app = connect();

      app.use('/blog', function (req, res) {
        res.end(req.originalUrl);
      });

      return request(app)
        .get('/blog/post/1')
        .expect(200, '/blog/post/1');
    });

    it('should adjust req.url', function () {
      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      return request(app)
        .get('/blog/post/1')
        .expect(200, '/post/1');
    });

    it('should strip trailing slash', function () {
      const blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog/', blog);

      return request(app)
        .get('/blog')
        .expect('blog');
    });

    it('should set .route', function () {
      const blog = connect();
      const admin = connect();
      app.use('/blog', blog);
      blog.use('/admin', admin);
      assert.equal(app.route, '/');
      assert.equal(blog.route, '/blog');
      assert.equal(admin.route, '/admin');
    });

    it('should not add trailing slash to req.url', function () {
      app.use('/admin', function (req, res, next) {
        next();
      });

      app.use(function (req, res, _next) {
        res.end(req.url);
      });

      return request(app)
        .get('/admin')
        .expect('/admin');
    });
  });

  describe('with a node app', function () {
    it('should mount', function () {
      const blog = http.createServer(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      return request(app)
        .get('/blog')
        .expect('blog');
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

      return request(app)
        .get('/')
        .expect('got error msg');
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

      return request(app)
        .get('/')
        .expect(200, 'msg');
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

      return request(app)
        .get('/')
        .expect(200, 'pass: boom!');
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

      return request(app)
        .get('/')
        .expect('X-Error', 'msg')
        .expect(200, 'got error msg');
    });

    it('should invoke error stack even when headers sent', function () {
      let invoked = false;
      app.use(function (req, res, next) {
        res.end('0');
        next(new Error('msg'));
      });
      app.use(function (_err, _req, _res, _next) {
        invoked = true;
      });

      return request(app)
        .get('/')
        .then(function () {
          assert.ok(invoked, 'error handler invoked');
        });
    });
  });
});
