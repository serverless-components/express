const { Component } = require('@serverless/core')
const {
  generateId,
  getClients,
  packageExpress,
  createOrUpdateRole,
  createOrUpdateLambda,
  createOrUpdateApi,
  createOrUpdateDomain,
  removeApi,
  removeRole,
  removeLambda,
  removeDomain
} = require('./utils')

class Express extends Component {

  /**
   * Deploy method
   * @param {object} inputs 
   */
  async deploy(inputs) {

    console.log(`Deploying Express App...`)

    // Validate
    if (!inputs.src) {
      throw new Error(`Missing "src" input.`)
    }
    // Validate
    if (inputs.timeout && inputs.timeout > 30) {
      throw new Error('"timeout" can not be greater than 30 seconds.')
    }

    // Set app name & region or use previously set name
    this.state.name = this.state.name || `${this.name}-${generateId()}`
    this.state.region = inputs.region || 'us-east-1'

    const clients = getClients(this.credentials.aws, inputs.region)

    await packageExpress(this, inputs)

    await createOrUpdateRole(this, inputs, clients)

    await createOrUpdateLambda(this, inputs, clients)

    await createOrUpdateApi(this, inputs, clients)

    if (inputs.domain) {
      await createOrUpdateDomain(this, inputs, clients)
    } else {
      if (this.state.domain) delete this.state.domain
    }

    const outputs = {}
    outputs.url = this.state.url
    if (this.state.domain) outputs.domain = `https://${this.state.domain}`

    return outputs
  }

  /**
   * Remove method
   */
  async remove() {

    const clients = getClients(this.credentials.aws, this.state.region)

    await removeRole(this, clients)
    await removeLambda(this, clients)
    await removeDomain(this, clients)
    await removeApi(this, clients)

    this.state = {}
    return {}
  }
}

module.exports = Express
