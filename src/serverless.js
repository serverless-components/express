const { Component } = require('@serverless/core')
const { deployRole } = require('./role')
const { deployLambda } = require('./lambda')
const { deployApig } = require('./apig')

const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait))

class AwsExpress extends Component {
  async deploy(inputs) {
    if (!inputs.src) {
      throw new Error(`Missing "src" input.`)
    }

    if (!inputs.role) {
      inputs.role = inputs.role || {}
      inputs.role.region = inputs.region
      inputs.role = await deployRole(inputs.role, this)
    }

    inputs.lambda = inputs.lambda || {}
    inputs.lambda.src = inputs.src
    inputs.lambda.region = inputs.region
    inputs.lambda.role = inputs.role
    inputs.handler = 'index.handler'
    const lambdaOutputs = await deployLambda(inputs.lambda, this)

    const apigInputs = {
      stage: 'production',
      description: 'An API for the Express component',
      region: inputs.region,
      endpoints: [
        {
          path: '/',
          method: 'any',
          function: lambdaOutputs.arn
        },
        {
          path: '/{proxy+}',
          method: 'any',
          function: lambdaOutputs.arn
        }
      ]
    }

    const apigOutputs = await deployApig(apigInputs, this)

    return { url: apigOutputs.url }
  }
}

module.exports = AwsExpress
