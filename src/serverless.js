const { Component } = require('@serverless/core')
const {
  log,
  generateId,
  getClients,
  getRole,
  ensureRole,
  getLambda,
  createLambda,
  updateLambdaCode,
  updateLambdaConfig,
  packageExpress,
  getApi,
  ensureApi,
  removeApi,
  removeRole,
  removeLambda,
  createDomain,
  removeDomain
} = require('./utils')

class Express extends Component {
  async deploy(inputs) {
    if (!inputs.src) {
      throw new Error(`Missing "src" input.`)
    }

    // set app name & region or use previously set name
    this.state.name = this.state.name || `${this.name}-${generateId()}`
    this.state.region = inputs.region || 'us-east-1'

    log(`Deploying Express App ${this.state.name}`)

    const clients = getClients(this.credentials.aws, inputs.region)

    // sync state with the provider in parallel
    // while packaging to save on deployment time
    await Promise.all([
      getRole(this, inputs, clients),
      getLambda(this, inputs, clients),
      getApi(this, inputs, clients),
      packageExpress(this, inputs)
    ])

    // make sure the role (whether default or provided by the user)
    // is valid and still exists on AWS
    await ensureRole(this, inputs, clients)

    if (!this.state.lambdaArn) {
      // create lambda if first deployment
      log(`Creating lambda ${this.state.name}`)
      await createLambda(this, inputs, clients)
    } else {
      // otherwise update code and config
      await updateLambdaCode(this, inputs, clients)
      await updateLambdaConfig(this, inputs, clients)
    }

    await ensureApi(this, inputs, clients)

    this.state.url = `https://${this.state.apiId}.execute-api.${this.state.region}.amazonaws.com`

    const outputs = {
      url: this.state.url
    }

    if (inputs.domain) {
      await createDomain(this, inputs, clients)
      outputs.domain = `https://${this.state.domain}`
    }

    return outputs
  }

  async remove() {
    if (Object.keys(this.state).length === 0) {
      log(`State is empty. Nothing to remove`)
      return {}
    }

    const clients = getClients(this.credentials.aws, this.state.region)

    const promises = [
      removeRole(this, clients),
      removeLambda(this, clients),
      removeApi(this, clients),
      removeDomain(this, clients)
    ]

    await Promise.all(promises)

    this.state = {}
    return {}
  }
}

module.exports = Express
