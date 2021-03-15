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
  retryIfRateExceeded,
} = require('./utils');

class Express extends Component {
  /**
   * Deploy
   * @param {object} inputs
   */
  async deploy(inputs) {
    const outputs = {};

    console.log('Deploying Express App...');

    inputs.domain = inputs.domain
      ? inputs.domain.replace('https://', '').replace('http://', '')
      : null;

    // for backward compatability
    this.state.domain = this.state.domain
      ? this.state.domain.replace('https://', '').replace('http://', '')
      : null;

    // Throw error on domain change
    if (inputs.domain && this.state.domain && this.state.domain !== inputs.domain) {
      throw new Error(
        `Changing the domain from ${this.state.domain} to ${inputs.domain} will remove your infrastructure.  Please remove it manually, change the domain, then re-deploy.`
      );
    }

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
      retryIfRateExceeded(() => createOrUpdateFunctionRole(this, inputs, clients)),
      retryIfRateExceeded(() => createOrUpdateMetaRole(this, inputs, clients, this.accountId)),
    ]);

    await retryIfRateExceeded(() => createOrUpdateLambda(this, inputs, clients));
    await retryIfRateExceeded(() => createOrUpdateAlias(this, inputs, clients));
    await retryIfRateExceeded(() => createOrUpdateApi(this, inputs, clients));

    if (inputs.domain) {
      await retryIfRateExceeded(() => createOrUpdateDomain(this, inputs, clients));
    } else if (this.state.domain) {
      delete this.state.domain;
    }

    // Set outputs

    outputs.apiGatewayUrl = this.state.apiGatewayUrl;

    if (inputs.domain) {
      // Ensure http info isn't replicated
      if (!inputs.domain.includes('http://') && !inputs.domain.includes('https://')) {
        outputs.url = `https://${inputs.domain}`;
      } else {
        outputs.url = inputs.domain;
      }
      // if domain is not in aws account, show the regional url
      // as it would be required by the external registrars
      if (this.state.apigatewayDomainName && !this.state.domainHostedZoneId) {
        outputs.regionalUrl = `https://${this.state.apigatewayDomainName}`;
      }
    } else {
      outputs.url = this.state.apiGatewayUrl;
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
    console.log('Fetching metrics...');

    const result = await getMetrics(
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
