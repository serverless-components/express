'use strict';

const path = require('path');
const AWS = require('aws-sdk');
const { ServerlessSDK } = require('@serverless/platform-client');
const dotenv = require('dotenv').config({ path: path.resolve(__dirname, '.env') }).parsed || {};

/*
 * Pauses execution for an X period of time
 */
const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait));

/*
 * Generate random id
 */
const generateId = () => Math.random().toString(36).substring(6);

/*
 * Fetches AWS credentials from the current environment
 * either from env vars, or .env file in the /tests directory
 */
const getCredentials = () => {
  const credentials = {
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || dotenv.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || dotenv.AWS_SECRET_ACCESS_KEY,
    },
  };

  if (!credentials.aws.accessKeyId || !credentials.aws.accessKeyId) {
    throw new Error('Unable to run tests. AWS credentials not found in the envionrment');
  }

  return credentials;
};

/*
 * Initializes and returns an instance of the serverless sdk
 * @param ${string} orgName - the serverless org name. Must correspond to the access key in the env
 */
const getServerlessSdk = (orgName) => {
  const sdk = new ServerlessSDK({
    accessKey: process.env.SERVERLESS_ACCESS_KEY || dotenv.SERVERLESS_ACCESS_KEY,
    context: {
      orgName,
    },
  });
  return sdk;
};

/*
 * Fetches a lambda function from aws for validation
 * @param ${object} credentials - the cross provider credentials object
 * @param ${string} lambdaName - the name of the lambda function
 */
const getLambda = async (credentials, lambdaName) => {
  const config = {
    credentials: credentials.aws,
    region: 'us-east-1',
  };
  const lambda = new AWS.Lambda(config);

  return lambda
    .getFunctionConfiguration({
      FunctionName: lambdaName,
    })
    .promise();
};

module.exports = { sleep, generateId, getCredentials, getServerlessSdk, getLambda };
