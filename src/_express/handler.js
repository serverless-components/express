const fs = require('fs')
const awsServerlessExpress = require('aws-serverless-express')

const expressPackageExists = () => {
  try {
    require('express')
    return true
  } catch (e) {
    return false
  }
}

exports.handler = async (event, context) => {
  // this makes sure dev mode cli catches unhandled rejections
  process.removeAllListeners('unhandledRejection')

  // make event object look like APIG 1.0
  // until aws-serverless-express supports APIG 2.0
  event.path = event.requestContext.http.path
  event.method = event.requestContext.http.method
  event.httpMethod = event.requestContext.http.method

  // NOTICE: require() is relative to this file, while existsSync() is relative to the cwd, which is the root of lambda
  let app
  if (fs.existsSync('./app.js')) {
    // load the user provided app
    if (expressPackageExists()) {
      app = require('../app.js')
    } else {
      // user probably did not run "npm i". return a helpful message.
      return {
        statusCode: 404,
        body: 'The "express" dependency was not found. Did you run "npm install"?'
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
      body: 'Express app not found. Please make sure it is exported in the app.js file.'
    }
  }

  const server = awsServerlessExpress.createServer(app)
  const res = await awsServerlessExpress.proxy(server, event, context, 'PROMISE')
  return res.promise
}
