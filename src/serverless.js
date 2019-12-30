const { Component } = require('@serverless/core')
const {
  getClients,
  getConfig,
  getRole,
  createRole,
  getLambda,
  createLambda,
  updateLambdaCode,
  packageExpress,
  getOrCreateApi,
  createIntegrations,
  createDeployment,
  removeRole,
  removeLambda,
  removeApi,
  ensureCertificate,
  getDomainHostedZoneId,
  deployApiDomain
} = require('./utils')

class Express extends Component {
  async deploy(inputs) {
    await this.status(`Initializing Express App`)

    const config = getConfig(inputs, this.state, this.org, this.stage, this.app, this.name)

    await this.debug(this.state.apig.certificateArn)
    await this.debug(this.state.apig.domainHostedZoneId)

    // add env vars required for the sdk to work
    config.lambda.env = {
      SERVERLESS_PLATFORM_STAGE: process.env.SERVERLESS_PLATFORM_STAGE,
      SERVERLESS_ACCESS_KEY: this.accessKey,
      SERVERLESS_ORG: this.org,
      SERVERLESS_COMPONENT_INSTANCE_ID: `${this.org}.${this.app}.${this.stage}.${this.name}`
    }

    const clients = getClients(this.credentials.aws, config.region)

    if (config.domain && !this.state.domain) {
      await this.status(`Initializing Domain`)
      await this.debug(`Setting up domain ${config.domain}`)

      if (!config.domainHostedZoneId) {
        this.state.domainHostedZoneId = await getDomainHostedZoneId(clients, config)
        await this.save()
        config.domainHostedZoneId = this.state.domainHostedZoneId
      }

      if (!config.certificateArn) {
        this.state.certificateArn = await ensureCertificate(clients, config, this)
        await this.save()
        config.certificateArn = this.state.certificateArn
      }
    }

    await this.status(`Packaging Express App`)
    await this.debug(`Fetching role ${config.role.name}`)
    await this.debug(`Fetching lambda ${config.lambda.name}`)
    await this.debug(`Fetching APIG ${config.lambda.name}`)
    await this.debug(`Packaging code from ${config.src}`)

    const res = await Promise.all([
      getRole(clients, config),
      getLambda(clients, config),
      getOrCreateApi(clients, config),
      packageExpress(config.src)
    ])

    config.role = res[0]
    config.lambda = res[1]
    config.apig = res[2]
    config.lambda.zipPath = res[3]

    if (!config.role.arn) {
      await this.status(`Creating Role`)
      await this.debug(`Creating role ${config.role.name}`)
      config.role = await createRole(clients, config)
      await this.debug(`Role created with ARN ${config.role.arn}`)
    }

    if (!config.lambda.arn) {
      await this.status(`Creating Lambda`)
      await this.debug(`Creating lambda ${config.lambda.name}`)
      config.lambda = await createLambda(clients, config)
      await this.debug(`Lambda created with ARN ${config.lambda.arn}`)

      await this.debug(`Creating integrations`)
      config.apig = await createIntegrations(clients, config)

      await this.status(`Finalizing`)
      await this.debug(`Creating Deployment`)
      config.apig = await createDeployment(clients, config)
    } else {
      await this.status(`Updating Lambda`)
      await this.debug(`Updating lambda code from ${config.src}`)
      config.lambda = await updateLambdaCode(clients, config)
      await this.debug(`Lambda code updated from ${config.src}`)
    }

    if (config.domain && !this.state.domain) {
      await deployApiDomain(clients, config, this)
    }

    config.url = `https://${config.apig.id}.execute-api.${config.region}.amazonaws.com/${config.apig.stage}`

    this.state = config
    await this.save()

    const outputs = {
      url: config.url
    }

    if (config.domain) {
      outputs.domain = `https://${this.state.domain}`
    }

    return outputs
  }

  async remove() {
    await this.status(`Removing`)
    if (Object.keys(this.state).length === 0) {
      await this.debug(`State is empty. Nothing to remove`)
      return {}
    }
    const config = this.state

    const clients = getClients(this.credentials.aws, this.state.region)

    await this.debug(`Removing role`)
    await this.debug(`Removing Lambda`)
    await this.debug(`Removing APIG`)
    await Promise.all([
      removeRole(clients, config),
      removeLambda(clients, config),
      removeApi(clients, config)
    ])

    this.state = {}
    await this.save()
    return {}
  }
}

module.exports = Express
