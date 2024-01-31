const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const connect = require('..');
const request = require('supertest');

describe('app.listen()', function () {
  it('should wrap in an http.Server', function (_, done) {
    const app = connect();

    app.use(function (req, res) {
      res.end();
    });

    const server = app.listen(0, function () {
      assert.ok(server);
      request(server)
        .get('/')
        .expect(200, function (err) {
          server.close(function () {
            done(err);
          });
        });
    });
  });
});
