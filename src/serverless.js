const { Component } = require('@serverless/core')
const moment = require('moment')
const {
  generateId,
  getClients,
  packageExpress,
  createOrUpdateFunctionRole,
  createOrUpdateMetaRole,
  createOrUpdateLambda,
  createOrUpdateApi,
  createOrUpdateDomain,
  removeApi,
  removeAllRoles,
  removeLambda,
  removeDomain,
  getMetrics,
} = require('./utils')

class Express extends Component {

  /**
   * Deploy
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

    await Promise.all([
      createOrUpdateFunctionRole(this, inputs, clients),
      createOrUpdateMetaRole(this, inputs, clients, this.accountId),
    ])

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
   * Remove
   */
  async remove() {

    const clients = getClients(this.credentials.aws, this.state.region)

    await removeAllRoles(this, clients)
    await removeLambda(this, clients)
    await removeDomain(this, clients)
    await removeApi(this, clients)

    this.state = {}
    return {}
  }

  /**
   * Metrics
   */
  async metrics(inputs = {}) {

    // Validate
    if (!inputs.rangeStart || !inputs.rangeEnd) {
      throw new Error('rangeStart and rangeEnd are require inputs')
    }

    inputs.rangeStart = moment(inputs.rangeStart)
    inputs.rangeEnd = moment(inputs.rangeEnd)

    // Validate: Start is before End
    if (inputs.rangeStart.isAfter(inputs.rangeEnd)) {
      throw new Error(`The rangeStart provided is after the rangeEnd`)
    }

    // Validate: End is not longer than 30 days
    if (inputs.rangeStart.diff(inputs.rangeEnd, 'days') >= 31) {
      throw new Error(`The range cannot be longer than 30 days.  The supplied range is: ${inputs.rangeStart.diff(inputs.rangeEnd, 'days')}`)
    }

    const result = await getMetrics(this.credentials.aws, this.state.region, this.state.metaRoleArn, this.state.apiId, inputs.rangeStart, inputs.rangeEnd)

    return result
  }
}

module.exports = Express
