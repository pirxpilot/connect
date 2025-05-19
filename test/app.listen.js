const { describe, it } = require('node:test');

const connect = require('..');
const { makeFetch } = require('supertest-fetch');

describe('app.listen()', function () {
  it('should wrap in an http.Server', (t, done) => {
    const app = connect();

    app.use(function (req, res) {
      res.end();
    });

    const server = app.listen(0, async () => {
      t.assert.ok(server);
      const request = makeFetch(server);
      await request('/').expectStatus(200);
      server.close();
      done();
    });
  });
});
