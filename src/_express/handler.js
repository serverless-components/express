'use strict';

const serverlessHttp = require('serverless-http');

// remove AWS Lambda default handling of unhandled rejections
// this makes sure dev mode cli catches unhandled rejections
process.removeAllListeners('unhandledRejection');

let app = (_req, res) => {
  res.statusCode = 200;
  res.end(`Request received: ${_req.method} - ${_req.path}`);
};

try {
  // eslint-disable-next-line import/no-unresolved
  app = require('..');

  // check if the user forgot to export their express app
  if (typeof app === 'object' && Object.keys(app).length === 0) {
    app = (_req, res) => {
      const e = new Error(
        'App not found. Please make sure the app is probably exported from the JS file.'
      );
      console.error(e);
      res.statusCode = 404;
      res.end(e.stack);
    };
  }
} catch (e) {
  // return require error and log it for dev mode
  app = (_req, res) => {
    console.error(e);
    res.statusCode = 500;
    res.end(e.stack);
  };
}

// default error handler logs errorss for dev mode
if (typeof app.use === 'function') {
  // eslint-disable-next-line
  app.use((err, req, res, next) => {
    console.error(err.stack);
    throw err;
  });
}

const handle = serverlessHttp(app);

exports.handler = async (event, context) => {
  const res = await handle(event, context);

  return res;
};
