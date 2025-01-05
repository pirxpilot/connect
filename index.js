/*!
 * connect
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

const { EventEmitter } = require('node:events');
const http = require('node:http');
const parseUrl = require('parseurl');

const debug = require('debug')('connect:dispatcher');

/**
 * Module exports.
 * @public
 */

module.exports = createServer;

/**
 * Module variables.
 * @private
 */

const proto = {
  use,
  handle,
  listen
};

/**
 * Create a new connect server.
 *
 * @return {function}
 * @public
 */

function createServer({ finalhandler = makeFinalHandler } = {}) {
  function app(req, res, next = finalhandler(req, res)) {
    app.handle(req, res, next);
  }
  Object.assign(app, proto, EventEmitter.prototype);
  app.route = '/';
  app.stack = [];
  return app;
}

/**
 * Utilize the given middleware `handle` to the given `route`,
 * defaulting to _/_. This "route" is the mount-point for the
 * middleware, when given a value other than _/_ the middleware
 * is only effective when that segment is present in the request's
 * pathname.
 *
 * For example if we were to mount a function at _/admin_, it would
 * be invoked on _/admin_, and _/admin/settings_, however it would
 * not be invoked for _/_, or _/posts_.
 *
 * @param {String|Function|Server} route, callback or server
 * @param {Function|Server} callback or server
 * @return {Server} for chaining
 * @public
 */

function use(...args) {
  let handle = args.at(-1);
  // default route to '/'
  let route = args.length > 1 ? args[0] : '/';

  // wrap sub-apps
  if (typeof handle.handle === 'function') {
    const server = handle;
    server.route = route;
    handle = (req, res, next) => server.handle(req, res, next);
  }

  // wrap vanilla http.Servers
  if (handle instanceof http.Server) {
    handle = handle.listeners('request')[0];
  }

  // strip trailing slash
  if (route.at(-1) === '/') {
    route = route.slice(0, -1);
  }

  // add the middleware
  debug('use %s %s', route || '/', handle.name || 'anonymous');
  this.stack.push({ route, handle });

  return this;
}

/**
 * Handle server requests, punting them down
 * the middleware stack.
 *
 * @private
 */

function handle(req, res, done = makeFinalHandler(req, res)) {
  let index = 0;
  const protohost = getProtohost(req.url);
  let removed = '';
  let slashAdded = false;
  const { stack } = this;

  // store the original URL
  req.originalUrl ??= req.url;

  function next(err) {
    if (slashAdded) {
      req.url = req.url.slice(1);
      slashAdded = false;
    }

    if (removed.length !== 0) {
      req.url = protohost + removed + req.url.slice(protohost.length);
      removed = '';
    }

    // next callback
    const layer = stack[index++];

    // all done
    if (!layer) {
      setImmediate(done, err);
      return;
    }

    // route data
    const path = parseUrl(req).pathname || '/';
    const { route } = layer;

    // skip this layer if the route doesn't match
    if (!path.toLowerCase().startsWith(route.toLowerCase())) {
      return next(err);
    }

    // skip if route match does not border "/", ".", or end
    const c = path.length > route.length && path[route.length];
    if (c && c !== '/' && c !== '.') {
      return next(err);
    }

    // trim off the part of the url that matches the route
    if (route.length !== 0 && route !== '/') {
      removed = route;
      req.url = protohost + req.url.slice(protohost.length + removed.length);

      // ensure leading slash
      if (!protohost && req.url[0] !== '/') {
        req.url = '/' + req.url;
        slashAdded = true;
      }
    }

    // call the layer handle
    call(layer.handle, route, err, req, res, next);
  }

  next();
}

/**
 * Listen for connections.
 *
 * This method takes the same arguments
 * as node's `http.Server#listen()`.
 *
 * HTTP and HTTPS:
 *
 * If you run your application both as HTTP
 * and HTTPS you may wrap them individually,
 * since your Connect "server" is really just
 * a JavaScript `Function`.
 *
 *      var connect = require('connect')
 *        , http = require('http')
 *        , https = require('https');
 *
 *      var app = connect();
 *
 *      http.createServer(app).listen(80);
 *      https.createServer(options, app).listen(443);
 *
 * @return {http.Server}
 * @api public
 */

function listen(...args) {
  const server = http.createServer(this);
  return server.listen(...args);
}

/**
 * Invoke a route handle.
 * @private
 */

function call(handle, route, err, req, res, next) {
  const arity = handle.length;
  const hasError = Boolean(err);

  debug('%s %s : %s', handle.name || '<anonymous>', route, req.originalUrl);

  let error = err;
  try {
    if (hasError && arity === 4) {
      // error-handling middleware
      const p = handle(err, req, res, next);
      if (p instanceof Promise) {
        p.catch((err = new Error('Promise rejected.')) => next(err));
      }
      return;
    } else if (!hasError && arity < 4) {
      // request-handling middleware
      const p = handle(req, res, next);
      if (p instanceof Promise) {
        p.catch((err = new Error('Promise rejected.')) => next(err));
      }
      return;
    }
  } catch (e) {
    // replace the error
    error = e;
  }

  // continue
  next(error);
}

/**
 * Get get protocol + host for a URL.
 *
 * @param {string} url
 * @private
 */

function getProtohost(url) {
  if (url.length === 0 || url[0] === '/') {
    return '';
  }

  const fqdnIndex = url.indexOf('://');
  if (fqdnIndex === -1) {
    return '';
  }

  const searchIndex = url.indexOf('?');
  if (searchIndex > -1 && fqdnIndex > searchIndex) {
    return '';
  }

  return url.slice(0, url.indexOf('/', 3 + fqdnIndex));
}

function makeFinalHandler(req, res) {

  return function (err) {

    // ignore 404 on in-flight response
    if (!err && res.headersSent) {
      debug('cannot 404 after headers sent');
      return;
    }

    let status = 404;
    // unhandled error
    if (err) {
      const { statusCode } = res;

      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599) {
        status = statusCode;
      } else if (typeof err === 'number') {
        // respect status code from error
        status = err;
      } else {
        status = 500;
      }
    }

    debug('default %s', status);

    // cannot actually respond
    if (res.headersSent) {
      debug('cannot %d after headers sent', status);
      req.socket.destroy();
      return;
    }

    // send response
    res.statusCode = status;
    res.end();
  };
}
