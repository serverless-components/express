const awsServerlessExpress = require('aws-serverless-express')

exports.handler = async (event, context) => {
  const app = require('../app')
  const server = awsServerlessExpress.createServer(app)
  let res = await awsServerlessExpress.proxy(server, event, context, 'PROMISE')
  return res.promise
}
