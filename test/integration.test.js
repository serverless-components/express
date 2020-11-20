'use strict';

const path = require('path');
const axios = require('axios');
const { sleep, getCredentials, getServerlessSdk, getLambda } = require('./utils');

// set enough timeout for deployment to finish
jest.setTimeout(100000);

// the yaml file we're testing against
const instanceYaml = {
  org: 'serverlessinc',
  app: 'component-tests',
  component: 'express@dev',
  name: 'express-integration-tests',
  stage: 'dev',
  inputs: {}, // should deploy with zero inputs
};

// we need to keep the initial instance state after first deployment
// to validate removal later
let firstInstanceState;

// get aws credentials from env
const credentials = getCredentials();

// get serverless access key from env and construct sdk
const sdk = getServerlessSdk(instanceYaml.org);

// clean up the instance after tests
afterAll(async () => {
  await sdk.remove(instanceYaml, credentials);
});

it('should successfully deploy express app', async () => {
  const instance = await sdk.deploy(instanceYaml, credentials);

  // store the inital state for removal validation later on
  firstInstanceState = instance.state;

  expect(instance.outputs.url).toBeDefined();
});

it('should successfully update basic configuration', async () => {
  instanceYaml.inputs.memory = 3008;
  instanceYaml.inputs.timeout = 30;
  instanceYaml.inputs.env = { DEBUG: 'express:*' };

  const instance = await sdk.deploy(instanceYaml, credentials);

  const lambda = await getLambda(credentials, instance.state.lambdaName);

  expect(lambda.MemorySize).toEqual(instanceYaml.inputs.memory);
  expect(lambda.Timeout).toEqual(instanceYaml.inputs.timeout);
  expect(lambda.Environment.Variables.DEBUG).toEqual(instanceYaml.inputs.env.DEBUG);
});

it('should successfully update source code', async () => {
  // first deployment we did not specify source
  // we're now specifying our own source
  instanceYaml.inputs.src = path.resolve(__dirname, 'src');

  const instance = await sdk.deploy(instanceYaml, credentials);

  const response = await axios.get(instance.outputs.url);

  // make sure it's the response we're expecting from the source we provided
  expect(response.data).toEqual('hello world');
});

it('should attach cookies correctly', async () => {
  instanceYaml.inputs.src = path.resolve(__dirname, 'src');

  const instance = await sdk.deploy(instanceYaml, credentials);

  const response1 = await axios.get(`${instance.outputs.url}/cookie`, {
    headers: {
      cookie: 'cookie1=yum',
    },
  });
  expect(response1.data).toEqual('cookie1=yum');

  const response2 = await axios.get(`${instance.outputs.url}/cookie`, {
    headers: {
      cookie: 'cookie1=yum; cookie2=hot',
    },
  });
  expect(response2.data).toEqual('cookie1=yum; cookie2=hot');

  const response3 = await axios.get(`${instance.outputs.url}/cookie`);
  expect(response3.data).toEqual('undefined');
});

it('should enable traffic shifting', async () => {
  // change source code and apply it to a small subset of traffic
  instanceYaml.inputs.traffic = 0.2;
  delete instanceYaml.inputs.src;

  const instance = await sdk.deploy(instanceYaml, credentials);

  // make 10 requests and compare the experimental vs stable code responses
  let stableCodeResponses = 0;
  let experimentalCodeResponses = 0;
  const get = async () => {
    if (stableCodeResponses + experimentalCodeResponses > 10 && experimentalCodeResponses > 1) {
      return null;
    }

    const response = await axios.get(instance.outputs.url);

    if (response.data === 'hello world') {
      stableCodeResponses++;
      return get();
    }
    experimentalCodeResponses++;

    return get();
  };

  await get();

  expect(stableCodeResponses).toBeGreaterThan(experimentalCodeResponses);
});

it('should disable traffic shifting', async () => {
  delete instanceYaml.inputs.traffic;

  const instance = await sdk.deploy(instanceYaml, credentials);

  // give aws some time...
  await sleep(10000);

  // make 10 requests and make sure old responses never appeared
  let requests = 0;
  const get = async () => {
    // after 10 requests, exit
    if (requests > 10) {
      return null;
    }

    // make a request
    const response = await axios.get(instance.outputs.url);

    // increment the number of requests made
    requests++;

    // this is an outdated response. We shouldn't receive it after disabling traffic shifting
    if (response.data === 'hello world') {
      throw new Error('Failed to disable traffic shifting. Outdated response received');
    }

    return get();
  };

  // make 10 requests and make sure they're all responding with the latest code changes
  await get();
});

it('should successfully remove express app', async () => {
  await sdk.remove(instanceYaml, credentials);

  // make sure lambda was actually removed
  let lambda;
  try {
    lambda = await getLambda(credentials, firstInstanceState.lambdaName);
  } catch (e) {
    if (e.code !== 'ResourceNotFoundException') {
      throw e;
    }
  }

  expect(lambda).toBeUndefined();
});
