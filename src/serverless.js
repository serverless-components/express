const { Component } = require('@serverless/core')
const {
  log,
  getClients,
  getConfig,
  getRole,
  createRole,
  getLambda,
  createLambda,
  updateLambdaCode,
  packageExpress,
  getApiV2,
  createApiV2,
  removeApiV2,
  removeRole,
  removeLambda,
  ensureCertificate,
  getDomainHostedZoneId,
  deployApiDomain,
  removeDomain
} = require('./utils')

class Express extends Component {
  async deploy(inputs) {
    const config = getConfig(inputs, this.state, this.org, this.stage, this.app, this.name)
    const clients = getClients(this.credentials.aws, config.region)

    if (config.domain && !this.state.domain) {
      log(`Setting up domain ${config.domain}`)

      if (!config.domainHostedZoneId) {
        this.state.domainHostedZoneId = await getDomainHostedZoneId(clients, config)
        config.domainHostedZoneId = this.state.domainHostedZoneId
      }

      if (!config.certificateArn) {
        this.state.certificateArn = await ensureCertificate(clients, config, this)
        config.certificateArn = this.state.certificateArn
      }
    }

    log(`Fetching role ${config.role.name}`)
    log(`Fetching lambda ${config.lambda.name}`)
    log(`Fetching APIG ${config.apig.name}`)
    log(`Packaging code from ${config.src}`)

    const res = await Promise.all([
      getRole(clients, config),
      getLambda(clients, config),
      getApiV2(clients, config),
      packageExpress(this, config)
    ])

    config.role = res[0]
    config.lambda = res[1]
    config.apig = res[2]
    config.lambda.zipPath = res[3]

    if (!config.role.arn) {
      log(`Creating role ${config.role.name}`)
      config.role = await createRole(clients, config)
      this.state.role = config.role
      log(`Role created with ARN ${config.role.arn}`)
    }

    if (!config.lambda.arn) {
      log(`Creating lambda ${config.lambda.name}`)
      config.lambda = await createLambda(clients, config)
      this.state.lambda = config.lambda
      log(`Lambda created with ARN ${config.lambda.arn}`)
    } else {
      log(`Updating lambda code from ${config.src}`)
      config.lambda = await updateLambdaCode(clients, config)
      this.state.lambda = config.lambda
      log(`Lambda code updated from ${config.src}`)
    }

    if (!config.apig.id) {
      log(`Creating Api ${config.apig.name}`)
      config.apig = await createApiV2(clients, config)
      this.state.apig = config.apig
      log(`Api ${config.apig.name} created with ID ${config.apig.id}`)
    }

    if (config.domain && !this.state.domain) {
      await deployApiDomain(clients, config, this)
    }

    config.url = `https://${config.apig.id}.execute-api.${config.region}.amazonaws.com`

    this.state = config

    const outputs = {
      url: config.url
    }

    if (config.domain) {
      outputs.domain = `https://${this.state.domain}`
    }

    return outputs
  }

  async remove() {
    if (Object.keys(this.state).length === 0) {
      log(`State is empty. Nothing to remove`)
      return {}
    }
    const config = this.state

    const clients = getClients(this.credentials.aws, this.state.region)

    log(`Removing role`)
    log(`Removing Lambda`)
    log(`Removing APIG`)

    const promises = [
      removeRole(clients, config),
      removeLambda(clients, config),
      removeApiV2(clients, config)
    ]

    if (config.domain) {
      log(`Removing domain`)
      promises.push(removeDomain(clients, config))
    }

    await Promise.all(promises)

    this.state = {}
    return {}
  }
}

module.exports = Express
