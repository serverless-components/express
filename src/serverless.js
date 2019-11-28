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
  removeApi
} = require('./utils')

class AwsExpress extends Component {
  async deploy(inputs) {
    await this.status(`Initializing Express App`)

    const config = getConfig(inputs, this.state)
    const clients = getClients(this.credentials.aws, config.region)

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
    } else {
      await this.status(`Updating Lambda`)
      await this.debug(`Updating lambda code from ${config.src}`)
      config.lambda = await updateLambdaCode(clients, config)
      await this.debug(`Lambda code updated from ${config.src}`)
    }

    // await sleep(2000)

    await this.debug(`Creating integrations`)
    config.apig = await createIntegrations(clients, config)

    await this.status(`Finalizing`)
    await this.debug(`Creating Deployment`)
    config.apig = await createDeployment(clients, config)

    config.url = `https://${config.apig.id}.execute-api.${config.region}.amazonaws.com/${config.apig.stage}`
    config.created = true

    this.state = config
    await this.save()

    return { url: config.url }
  }

  async update(inputs) {
    if (!this.state.created) {
      throw new Error(
        'Express infrastructure was not deployed. Please run "serverless deploy" first.'
      )
    }
    const clients = getClients(this.credentials.aws, inputs.region)
    await this.status(`Updating Code`)
    await this.debug(`Express Infrastructure already created. Updating code from ${inputs.src}.`)
    this.state.lambda.zipPath = await packageExpress(inputs.src)
    await updateLambdaCode(clients, this.state)
    return { url: this.state.url }
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

module.exports = AwsExpress
