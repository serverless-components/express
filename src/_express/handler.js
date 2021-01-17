'use strict';

const serverlessHttp = require('serverless-http');

// remove AWS Lambda default handling of unhandled rejections
// this makes sure dev mode cli catches unhandled rejections
process.removeAllListeners('unhandledRejection');

let app = (_req, res) => {
  res.statusCode = 200;
  res.end(`Request received: ${_req.method} - ${_req.path}`);
};

// NOTICE: require() is relative to this file
try {
  // eslint-disable-next-line import/no-unresolved
  app = require('..');

  if (typeof app === 'object' && Object.keys(app).length === 0) {
    app = (_req, res) => {
      res.statusCode = 404;
      res.end('App not found. Please make sure the app is probably exported from the JS file.');
    };
  }
} catch (e) {
  if (e.message.includes('Cannot find module')) {
    // user probably did not run "npm i". return a helpful message.
    app = (_req, res) => {
      res.statusCode = 500;
      res.end('Did you install all your dependencies within your source folder via npm?');
    };
  } else {
    // some other error such as package.json main not matching filename
    app = (_req, res) => {
      res.statusCode = 500;
      res.end(e.stack);
    };
  }
}

// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).send('caught');
// });

const handle = serverlessHttp(app);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const res = await handle(event, context);

  // log the error for dev mode
  if (res.statusCode > 300) {
    console.error(res.body);
  }

  return res;
};
