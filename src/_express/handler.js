'use strict'

const fs = require('fs')
const awsServerlessExpress = require('aws-serverless-express')

exports.handler = async (event, context) => {
  // remove AWS Lambda default handling of unhandled rejections
  // this makes sure dev mode cli catches unhandled rejections
  process.removeAllListeners('unhandledRejection')

  // make event object look like APIG 1.0
  // until aws-serverless-express supports APIG 2.0
  event.path = event.requestContext.http.path
  event.method = event.requestContext.http.method
  event.httpMethod = event.requestContext.http.method
  // APIG 2.0 extracts cookies from headers automatically.
  // We need to put `cookie` back to `headers.cookie` so it works with current aws-serverless-express
  if (event.cookies && event.cookies.length > 0) {
    event.headers.cookie = event.cookies.join('; ')
  }

  // NOTICE: require() is relative to this file, while existsSync() is relative to the cwd, which is the root of lambda
  let app
  if (fs.existsSync('./app.js')) {
    // load the user provided app

    try {
      app = require('../app.js')
    } catch (e) {
      if (e.message.includes("Cannot find module 'express'")) {
        // user probably did not run "npm i". return a helpful message.
        return {
          statusCode: 404,
          body:
            'The "express" dependency was not found. Did you install "express" as a dependency within your source folder via npm?'
        }
      }
      // some other require error
      return {
        statusCode: 404,
        body: e.message
      }
    }
  } else {
    // load the built-in default app
    app = require('../_src/app.js')
  }

  if (typeof app !== 'function') {
    // make sure user exported app in app.js or return a helpful message.
    return {
      statusCode: 404,
      body:
        'Express app not found. Please make sure you are exporting express from an "app.js" file.'
    }
  }

  const server = awsServerlessExpress.createServer(app)
  const res = await awsServerlessExpress.proxy(server, event, context, 'PROMISE')
  return res.promise
}
