'use strict';

// eslint-disable-next-line import/no-unresolved
const { Component } = require('@serverless/core');
const {
  generateId,
  getClients,
  packageExpress,
  createOrUpdateFunctionRole,
  createOrUpdateMetaRole,
  createOrUpdateLambda,
  createOrUpdateAlias,
  createOrUpdateApi,
  createOrUpdateDomain,
  removeApi,
  removeAllRoles,
  removeLambda,
  removeDomain,
  getMetrics,
} = require('./utils');

class Express extends Component {
  /**
   * Deploy
   * @param {object} inputs
   */
  async deploy(inputs) {
    const outputs = {};

    // Defaults
    inputs.inference = inputs.inference === true;

    // Check credentials exist
    if (Object.keys(this.credentials.aws).length === 0) {
      const msg =
        'AWS Credentials not found. Make sure you have a .env file in the cwd. - Docs: https://git.io/JvArp';
      throw new Error(msg);
    }

    console.log('Deploying Express App...');

    // Validate
    if (inputs.timeout && inputs.timeout > 30) {
      throw new Error('"timeout" can not be greater than 30 seconds.');
    }

    // Set app name & region or use previously set name
    this.state.name = this.state.name || `${this.name}-${generateId()}`;
    this.state.region = inputs.region || 'us-east-1';

    const clients = getClients(this.credentials.aws, inputs.region);

    await packageExpress(this, inputs, outputs);

    await Promise.all([
      createOrUpdateFunctionRole(this, inputs, clients),
      createOrUpdateMetaRole(this, inputs, clients, this.accountId),
    ]);

    await createOrUpdateLambda(this, inputs, clients);

    await createOrUpdateAlias(this, inputs, clients);

    await createOrUpdateApi(this, inputs, clients);

    if (inputs.domain) {
      await createOrUpdateDomain(this, inputs, clients);
    } else if (this.state.domain) {
      delete this.state.domain;
    }

    outputs.url = this.state.url;

    if (inputs.domain) {
      // if domain is not in aws account, show the regional url
      // as it would be required by the external registrars
      if (this.state.apigatewayDomainName && !this.state.domainHostedZoneId) {
        outputs.regionalUrl = `https://${this.state.apigatewayDomainName}`;
      }
      outputs.domain = `https://${inputs.domain}`;
    }

    return outputs;
  }

  /**
   * Remove
   */
  async remove() {
    const clients = getClients(this.credentials.aws, this.state.region);

    await removeAllRoles(this, clients);
    await removeLambda(this, clients);
    await removeDomain(this, clients);
    await removeApi(this, clients);

    this.state = {};
    return {};
  }

  /**
   * Metrics
   */
  async metrics(inputs = {}) {
    // Validate
    if (!inputs.rangeStart || !inputs.rangeEnd) {
      throw new Error('rangeStart and rangeEnd are require inputs');
    }

    const result = await getMetrics(
      this.credentials.aws,
      this.state.region,
      this.state.metaRoleArn,
      this.state.apiId,
      this.state.lambdaName,
      inputs.rangeStart,
      inputs.rangeEnd
    );

    return result;
  }
}

module.exports = Express;
