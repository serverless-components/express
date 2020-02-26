const fs = require('fs')
const awsServerlessExpress = require('aws-serverless-express')

exports.handler = async (event, context) => {
  // load the built-in default app
  let app = require('./app.js')

  // if the user provided their ownn app, load that instead
  // NOTICE: require is relative to this file, while existsSync is relative to the cwd, which is the root of lambda
  if (fs.existsSync('./app.js')) {
    app = require('../app.js')
  }

  const server = awsServerlessExpress.createServer(app)
  const res = await awsServerlessExpress.proxy(server, event, context, 'PROMISE')
  return res.promise
}
