const phin = require('./phin')

const getEndpoints = () => {
  let stage = 'prod'
  if (process.env.SERVERLESS_PLATFORM_STAGE && process.env.SERVERLESS_PLATFORM_STAGE !== 'prod') {
    stage = 'dev'
  }

  const stages = {
    dev: {
      http: `https://y6w6rsjkib.execute-api.us-east-1.amazonaws.com/dev`,
      socket: `wss://kiexxv95i8.execute-api.us-east-1.amazonaws.com/dev`
    },
    prod: {
      http: `https://components-api.serverless.com`,
      socket: `wss://qtrusbzkq4.execute-api.us-east-1.amazonaws.com/prod`
    }
  }

  const endpoints = stages[stage]

  return endpoints
}

const engine = new Proxy(
  {},
  {
    get: (obj, functionName) => {
      const endpoints = getEndpoints()

      const callFunction = async (inputs = {}) => {
        const options = {
          url: `${endpoints.http}/engine/${functionName}`,
          parse: 'json',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: inputs
        }

        if (inputs.accessKey) {
          options.headers['Authorization'] = `Bearer ${inputs.accessKey}`
        }
        if (inputs.org) {
          options.headers['serverless-org-name'] = inputs.org
        }

        const res = await phin(options)

        if (res.statusCode !== 200) {
          const { message, stack, code } = res.body

          const backendError = new Error(message)

          if (stack) {
            backendError.stack = stack
          }

          if (code) {
            backendError.code = code
          }

          throw backendError
        }
        return res.body
      }

      return callFunction
    }
  }
)

const streamLog = async (data) => {
  const inputs = {
    accessKey: process.env.SERVERLESS_ACCESS_KEY,
    org: process.env.SERVERLESS_ORG,
    instanceId: process.env.SERVERLESS_COMPONENT_INSTANCE_ID,
    data
  }

  return engine.sendToInstanceConnections(inputs)
}

function asyncFunction() {
  return streamLog
}

module.exports = asyncFunction
