'use strict';

const path = require('path');
const AWS = require('@serverless/aws-sdk-extra');
const https = require('https');
const { parseDomain } = require('parse-domain');

const agent = new https.Agent({
  keepAlive: true,
});

const { readFile, copySync } = require('fs-extra');

/*
 * Pauses execution for the provided miliseconds
 *
 * @param ${number} wait - number of miliseconds to wait
 */
const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait));

/*
 * Generates a random id
 */
const generateId = () => Math.random().toString(36).substring(6);

/**
 * Generate a default description for resources
 * @param {*} instance
 */
const getDefaultDescription = (instance) => {
  return `A resource of the Serverless Express Component for ${instance.org} - ${instance.stage} - ${instance.app} - ${instance.name}`;
};

/**
 * The ARN of the Lambda IAM Policy used for the default IAM Role
 */
const getDefaultLambdaRolePolicyArn = () => {
  return 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
};

/*
 * Initializes an AWS SDK and returns the relavent service clients
 *
 * @param ${object} credentials - aws credentials object
 * @param ${string} region - aws region
 */
const getClients = (credentials, region = 'us-east-1') => {
  AWS.config.update({
    httpOptions: {
      agent,
    },
  });

  const sts = new AWS.STS({ credentials, region });
  const iam = new AWS.IAM({ credentials, region });
  const lambda = new AWS.Lambda({ credentials, region });
  const apig = new AWS.ApiGatewayV2({ credentials, region });
  const route53 = new AWS.Route53({ credentials, region });
  const acm = new AWS.ACM({
    credentials,
    region,
  });
  const extras = new AWS.Extras({ credentials, region });

  return {
    sts,
    iam,
    lambda,
    apig,
    route53,
    acm,
    extras,
  };
};

/*
 * Extracts the naked second level domain (ie. serverless.com) from
 * the provided domain or subdomain (ie. api.serverless.com)
 *
 * @param ${string} domain - the domain input that the user provided
 */
const getNakedDomain = (domain) => {
  const parsedDomain = parseDomain(domain);

  if (!parsedDomain.topLevelDomains) {
    throw new Error(`"${domain}" is not a valid domain.`);
  }

  const nakedDomain = `${parsedDomain.domain}.${parsedDomain.topLevelDomains.join('.')}`;
  return nakedDomain;
};

/*
 * Packages express app and injects shims and sdk
 *
 * @param ${instance} instance - the component instance
 * @param ${object} config - the component config
 */
const packageExpress = async (instance, inputs) => {
  console.log('Packaging Express.js application...');

  // unzip source zip file
  console.log(`Unzipping ${inputs.src || 'files'}...`);
  const sourceDirectory = await instance.unzip(inputs.src);
  console.log(`Files unzipped into ${sourceDirectory}...`);

  // add shim to the source directory
  console.log('Installing Express + AWS Lambda handler...');
  copySync(path.join(__dirname, '_express'), path.join(sourceDirectory, '_express'));

  /**
   * DEPRECATED: This runs untrusted code and should not be used until we can find a way to do this more securely.
   */
  // Attempt to infer data from the application
  // if (inputs.openApi) {
  //   console.log('Attempting to collect API routes and convert to OpenAPI format, since openAPI is set to 'true'')
  //   await infer(instance, inputs, outputs, sourceDirectory);
  // }

  // add sdk to the source directory, add original handler
  console.log('Installing Serverless Framework SDK...');
  instance.state.handler = await instance.addSDK(sourceDirectory, '_express/handler.handler');

  if (!inputs.src) {
    // add default express app
    console.log('Installing Default Express App...');
    copySync(path.join(__dirname, '_src'), path.join(sourceDirectory));
  }
  // zip the source directory with the shim and the sdk

  console.log('Zipping files...');
  const zipPath = await instance.zip(sourceDirectory);
  console.log(`Files zipped into ${zipPath}...`);

  // save the zip path to state for lambda to use it
  instance.state.zipPath = zipPath;

  return zipPath;
};

/*
 * DEPRECATED: This runs untrusted code and should not be used until we can find a way to do this more securely.
 *
 * Infer data from the Application by attempting to intiatlize it during deployment and extracting data.
 *
 * @param ${object} instance - the component instance
 * @param ${object} inputs - the component inputs
 */
// const infer = async (instance, inputs, outputs, sourceDirectory) => {
//   // Initialize application
//   let app;
//   try {
//     // Load app
//     app = require(path.join(sourceDirectory, './app.js'));
//   } catch (error) {
//     const msg = error.message;
//     error.message = `OpenAPI auto-generation failed due to the Express Component not being able to start your app. To fix this, you can turn this feature off by specifying 'inputs.openApi: false' or fix the following issue: ${msg}`;
//     throw error;
//   }

//   try {
//     await generateOpenAPI(instance, inputs, outputs, app);
//   } catch (error) {
//     const msg = error.message;
//     error.message = `OpenAPI auto-generation failed due to the Express Component not being able to start your app.  To fix this, you can turn this feature off by specifying 'inputs.openApi: false' or fix the following issue: ${msg}`;
//     throw error;
//   }
// };

/*
 * DEPRECATED: This runs untrusted code and should not be used until we can find a way to do this more securely.
 *
 * Generate an OpenAPI specification from the Application
 *
 * @param ${object} instance - the component instance
 * @param ${object} inputs - the component inputs
 */
// const generateOpenAPI = async (instance, inputs, outputs, app) => {
//   // Open API Version 3.0.3, found here: https://swagger.io/specification/
//   // TODO: This is not complete, but the pieces that do exist are accurate.
//   const openApi = {
//     openapi: '3.0.3',
//     info: {
//       // title: null,
//       // description: null,
//       version: '0.0.1',
//     },
//     paths: {},
//   };

//   // Parts of the OpenAPI spec that we may use these at a later date.
//   // For now, they are unincorporated.
//   // const oaServersObject = {
//   //   url: null,
//   //   description: null,
//   //   variables: {},
//   // };
//   // const oaComponentsObject = {
//   //   schemas: {},
//   //   responses: {},
//   //   parameters: {},
//   //   examples: {},
//   //   requestBodies: {},
//   //   headers: {},
//   //   securitySchemes: {},
//   //   links: {},
//   //   callbacks: {},
//   // };
//   // const oaPathItem = {
//   //   description: null,
//   //   summary: null,
//   //   operationId: null,
//   //   responses: {},
//   // };

//   if (app && app._router && app._router.stack && app._router.stack.length) {
//     app._router.stack.forEach((route) => {
//       // This array holds all middleware layers, which include routes and more
//       // First check if this 'layer' is an express route type, otherwise skip
//       if (!route.route) return;

//       // Define key data
//       const ePath = route.route.path;

//       if (['*', '/*'].indexOf(ePath) > -1) {
//         return;
//       }

//       // Save path
//       openApi.paths[ePath] = openApi.paths[ePath] || {};

//       for (const method of Object.keys(route.route.methods)) {
//         // Save method
//         openApi.paths[ePath][method] = {};
//       }
//     });
//   }

//   // Save to outputs
//   outputs.api = openApi;
// };

/*
 * Fetches a lambda function by ARN
 */
const getLambda = async (clients, lambdaName) => {
  try {
    const res = await clients.lambda
      .getFunctionConfiguration({
        FunctionName: lambdaName,
      })
      .promise();
    return res.FunctionArn;
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      return null;
    }
    throw e;
  }
};

const getVpcConfig = (vpcConfig) => {
  if (vpcConfig == null) {
    return {
      SecurityGroupIds: [],
      SubnetIds: [],
    };
  }

  return {
    SecurityGroupIds: vpcConfig.securityGroupIds,
    SubnetIds: vpcConfig.subnetIds,
  };
};

/*
 * Creates a lambda function on aws
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createLambda = async (instance, inputs, clients, retries = 0) => {
  // Track retries
  retries++;

  const vpcConfig = getVpcConfig(inputs.vpc);

  const params = {
    FunctionName: instance.state.lambdaName,
    Code: {},
    Description: inputs.description || getDefaultDescription(instance),
    Handler: instance.state.handler,
    MemorySize: inputs.memory || 1536,
    Publish: true,
    Role: instance.state.userRoleArn || instance.state.defaultLambdaRoleArn, // Default to automatically created role
    Runtime: 'nodejs12.x',
    Timeout: inputs.timeout || 29, // Meet the APIG timeout limit, don't exceed it
    Environment: {
      Variables: inputs.env || {},
    },
    VpcConfig: vpcConfig,
  };

  if (inputs.layers) {
    params.Layers = inputs.layers;
  }

  console.log('Creating AWS Lambda...');
  params.Code.ZipFile = await readFile(instance.state.zipPath);

  try {
    const res = await clients.lambda.createFunction(params).promise();
    console.log(`Lambda created with ARN ${res.FunctionArn}`);
    instance.state.lambdaArn = res.FunctionArn;
    instance.state.lambdaVersion = res.Version;
  } catch (e) {
    console.log(`Unable to create AWS Lambda due to: ${e.message}`);

    // Handle known errors

    if (e.message.includes('The role defined for the function cannot be assumed by Lambda')) {
      // This error can happen upon first creation.  So sleeping is an acceptable solution.  This code will retry multiple times.
      if (retries > 5) {
        console.log(
          'Attempted to retry Lambda creation 5 times, but the invalid role error persists.  Aborting...'
        );

        // Throw different errors, depending on whether the user is using a custom role
        if (instance.state.userRoleArn) {
          throw new Error(
            'Unable to create the AWS Lambda function which your Express.js app runs on.  The reason is "the role defined for the function cannot be assumed by Lambda".  This might be due to a missing or invalid "Trust Relationship" within the policy of the custom IAM Role you you are attempting to use.  Try modifying that.  If that doesn\'t work, this is an issue with AWS Lambda\'s APIs.  We suggest trying to remove this instance by running "serverless remove" then redeploying to get around this.'
          );
        } else {
          throw new Error(
            'Unable to create the AWS Lambda function which your Express.js app runs on.  The reason is "the role defined for the function cannot be assumed by Lambda".  This is an issue with AWS Lambda\'s APIs.  We suggest trying to remove this instance by running "serverless remove" then redeploying to get around this.  This seems to be the only way users have gotten past this.'
          );
        }
      }
      // Try again.  We often to wait around 3 seconds after the role is created before it can be assumed
      await sleep(3000);
      return createLambda(instance, inputs, clients, retries);
    }

    if (
      e.message.includes(
        'Lambda was unable to configure access to your environment variables because the KMS key is invalid'
      )
    ) {
      // This error can happen upon first creation.  So sleeping is an acceptable solution.  This code will retry multiple times.
      if (retries > 5) {
        console.log(
          'Attempted to retry Lambda creation 5 times, but the KMS error persists  Aborting...'
        );
        throw new Error(
          'Unable to create the AWS Lambda function which your Express.js app runs on.  The reason is "Lambda was unable to configure access to your environment variables because the KMS key is invalid".  This is a known issue with AWS Lambda\'s APIs, and there is nothing the Serverless Framework can do to help with it at this time.  We suggest trying to remove this instance by running "serverless remove" then redeploying to attempt to get around this.'
        );
      }
      // Retry.
      await sleep(3000);
      return createLambda(instance, inputs, clients, retries);
    }

    throw e;
  }
  return null;
};

/*
 * Updates lambda code on aws according to the provided source
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const updateLambdaCode = async (instance, inputs, clients) => {
  const functionCodeParams = {
    FunctionName: instance.state.lambdaName,
    Publish: true,
  };
  functionCodeParams.ZipFile = await readFile(instance.state.zipPath);
  const res = await clients.lambda.updateFunctionCode(functionCodeParams).promise();
  instance.state.lambdaArn = res.FunctionArn;
  instance.state.lambdaVersion = res.Version;
};

/*
 * Updates lambda code on aws according to the provided config
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const updateLambdaConfig = async (instance, inputs, clients) => {
  const vpcConfig = getVpcConfig(inputs.vpc);

  const functionConfigParams = {
    FunctionName: instance.state.lambdaName,
    Description: inputs.description || getDefaultDescription(instance),
    MemorySize: inputs.memory || 1536,
    Role: instance.state.userRoleArn || instance.state.defaultLambdaRoleArn, // Default to auto-create role
    Timeout: inputs.timeout || 29, // Meet APIG timeout limit, don't exceed it
    Handler: instance.state.handler,
    Runtime: 'nodejs12.x',
    Environment: {
      Variables: inputs.env || {},
    },
    VpcConfig: vpcConfig,
  };

  if (inputs.layers) {
    functionConfigParams.Layers = inputs.layers;
  }

  try {
    const res = await clients.lambda.updateFunctionConfiguration(functionConfigParams).promise();
    return res.FunctionArn;
  } catch (e) {
    if (
      e.message.includes('The role defined for the function cannot be assumed by Lambda') ||
      e.message.includes(
        'Lambda was unable to configure access to your environment variables because the KMS key is invalid'
      )
    ) {
      // we need to wait around 2 seconds after the role is created before it can be assumed
      await sleep(2000);
      return updateLambdaConfig(instance, inputs, clients);
    }
    throw e;
  }
};

/**
 * Get the Hosted Zone ID of the custom domain in Route 53
 */
const getDomainHostedZoneId = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain);

  instance.state.nakedDomain = nakedDomain;

  console.log(`Getting Route53 Hosted Zone ID for domain: ${nakedDomain}`);

  const hostedZones = await clients.route53.listHostedZonesByName().promise();

  let hostedZone = hostedZones.HostedZones.find(
    // Name has a period at the end, so we're using includes rather than equals
    (zone) => zone.Name.includes(nakedDomain)
  );

  if (!hostedZone) {
    console.log(
      `Domain ${nakedDomain} was not found in your AWS account. Skipping DNS operations.`
    );
    return null;
  }

  hostedZone = hostedZone.Id.replace('/hostedzone/', ''); // hosted zone id is always prefixed with this :(

  console.log(`Domain hosted zone id for ${nakedDomain} is ${hostedZone}`);

  return hostedZone;
};

const getCertificateArnByDomain = async (clients, instance) => {
  const listRes = await clients.acm.listCertificates().promise();
  const certificate = listRes.CertificateSummaryList.find(
    (cert) => cert.DomainName === instance.state.nakedDomain
  );
  return certificate && certificate.CertificateArn ? certificate.CertificateArn : null;
};

const getCertificateValidationRecord = (certificate, domain) => {
  if (!certificate.DomainValidationOptions) {
    return null;
  }
  const domainValidationOption = certificate.DomainValidationOptions.find(
    (option) => option.DomainName === domain
  );

  return domainValidationOption.ResourceRecord;
};

const describeCertificateByArn = async (clients, certificateArn, domain) => {
  const res = await clients.acm.describeCertificate({ CertificateArn: certificateArn }).promise();
  const certificate = res && res.Certificate ? res.Certificate : null;

  if (
    certificate.Status === 'PENDING_VALIDATION' &&
    !getCertificateValidationRecord(certificate, domain)
  ) {
    await sleep(1000);
    return describeCertificateByArn(clients, certificateArn, domain);
  }

  return certificate;
};

const findOrCreateCertificate = async (instance, clients) => {
  const wildcardSubDomain = `*.${instance.state.nakedDomain}`;

  const params = {
    DomainName: instance.state.nakedDomain,
    SubjectAlternativeNames: [instance.state.nakedDomain, wildcardSubDomain],
    ValidationMethod: 'DNS',
  };

  console.log(`Checking if a certificate for the ${instance.state.nakedDomain} domain exists`);
  let certificateArn = await getCertificateArnByDomain(clients, instance);

  if (!certificateArn) {
    console.log(
      `Certificate for the ${instance.state.nakedDomain} domain does not exist. Creating...`
    );
    certificateArn = (await clients.acm.requestCertificate(params).promise()).CertificateArn;
  }

  const certificate = await describeCertificateByArn(
    clients,
    certificateArn,
    instance.state.nakedDomain
  );

  console.log(
    `Certificate for ${instance.state.nakedDomain} is in a '${certificate.Status}' status`
  );

  if (certificate.Status === 'PENDING_VALIDATION') {
    const certificateValidationRecord = getCertificateValidationRecord(
      certificate,
      instance.state.nakedDomain
    );
    // only validate if domain/hosted zone is found in this account
    if (instance.state.domainHostedZoneId) {
      console.log(`Validating the certificate for the ${instance.state.nakedDomain} domain.`);

      const recordParams = {
        HostedZoneId: instance.state.domainHostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: {
                Name: certificateValidationRecord.Name,
                Type: certificateValidationRecord.Type,
                TTL: 300,
                ResourceRecords: [
                  {
                    Value: certificateValidationRecord.Value,
                  },
                ],
              },
            },
          ],
        },
      };
      await clients.route53.changeResourceRecordSets(recordParams).promise();
      console.log(
        'Your certificate was created and is being validated. It may take a few mins to validate.'
      );
      console.log(
        'Please deploy again after few mins to use your newly validated certificate and activate your domain.'
      );
    } else {
      // if domain is not in account, let the user validate manually
      console.log(
        `Certificate for the ${instance.state.nakedDomain} domain was created, but not validated. Please validate it manually.`
      );
      console.log(`Certificate Validation Record Name: ${certificateValidationRecord.Name} `);
      console.log(`Certificate Validation Record Type: ${certificateValidationRecord.Type} `);
      console.log(`Certificate Validation Record Value: ${certificateValidationRecord.Value} `);
    }
  } else if (certificate.Status === 'ISSUED') {
    // if certificate status is ISSUED, mark it a as valid for CloudFront to use
    instance.state.certificateValid = true;
  } else if (certificate.Status === 'SUCCESS') {
    // nothing to do here. We just need to wait a min until the status changes to ISSUED
  } else if (certificate.Status === 'VALIDATION_TIMED_OUT') {
    // if 72 hours passed and the user did not validate the certificate
    // it will timeout and the user will need to recreate and validate the certificate manulaly
    console.log(
      'Certificate validation timed out after 72 hours. Please recreate and validate the certifcate manually.'
    );
    console.log('Your domain will not work until your certificate is created and validated.');
  } else {
    // something else happened?!
    throw new Error(
      `Failed to validate ACM certificate. Unsupported ACM certificate status ${certificate.Status}`
    );
  }

  return certificateArn;
};
/**
 * Create a custom domain record in API Gateway
 * @param {*} instance
 * @param {*} inputs
 * @param {*} clients
 */
const createDomainInApig = async (instance, inputs, clients) => {
  console.log(`Domain ${inputs.domain} not found in API Gateway. Creating...`);

  let res;
  try {
    const params = {
      DomainName: inputs.domain,
      DomainNameConfigurations: [
        {
          EndpointType: 'REGIONAL', // ApiGateway V2 does not support EDGE endpoints yet (Writte in April 9th 2020)
          SecurityPolicy: 'TLS_1_2',
          CertificateArn: instance.state.certificateArn,
        },
      ],
    };
    res = await clients.apig.createDomainName(params).promise();
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log('API Gateway is throttling our API Requests *sigh*.  Sleeping for 2 seconds...');
      await sleep(2000);
      return createDomainInApig(instance, inputs, clients);
    }
    throw e;
  }
  return res;
};

/**
 * Ensure a Route 53 Hosted Zone AliasTarget Record Set for the HTTP Custom Domain
 * @param {*} instance
 * @param {*} inputs
 * @param {*} clients
 */
const ensureRecordSetForApiGCustomDomain = async (instance, inputs, clients) => {
  console.log(
    `Ensuring the existence of a Route 53 Hosted Zone AliasTarget Record Set for HTTP API with a Hosted Zone ID: ${instance.state.apigatewayHostedZoneId} and DNS Name: ${instance.state.apigatewayDomainName}.`
  );

  const changeParams = {
    HostedZoneId: instance.state.domainHostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: inputs.domain,
            Type: 'A',
            AliasTarget: {
              HostedZoneId: instance.state.apigatewayHostedZoneId,
              DNSName: instance.state.apigatewayDomainName,
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  };

  try {
    await clients.route53.changeResourceRecordSets(changeParams).promise();
  } catch (error) {
    console.error(error);
  }
};

/**
 * Find or create a custom domain on API Gateway
 */
const findOrCreateCustomDomain = async (instance, inputs, clients) => {
  const result = {};
  // Find or create custom domain on API Gateway
  try {
    console.log(`Verifying Custom Domain exists on API Gateway: ${inputs.domain}...`);
    const params = { DomainName: inputs.domain };
    const domain = await clients.apig.getDomainName(params).promise();
    result.apigatewayHostedZoneId = domain.DomainNameConfigurations[0].HostedZoneId;
    result.apigatewayDomainName = domain.DomainNameConfigurations[0].ApiGatewayDomainName;
    return result;
  } catch (error) {
    if (error.code === 'NotFoundException') {
      console.log(`Custom Domain not found in API Gateway: ${inputs.domain}.  Creating it...`);
      const res = await createDomainInApig(instance, inputs, clients);
      result.apigatewayHostedZoneId = res.DomainNameConfigurations[0].HostedZoneId;
      result.apigatewayDomainName = res.DomainNameConfigurations[0].ApiGatewayDomainName;
      console.log(
        `Domain ${instance.state.domain} successfully created. If this is your first deploy, please note that you will have to wait typical DNS propagation times for your domain name to be accessible.  This is often only 10-20 minutes, but on occassion can take ~4 hours.`
      );
      return result;
    }
    throw error;
  }
};

/**
 * Ensure API Gateway API is mapped to the custom API Gateway Domain
 */
const findOrCreateApiMapping = async (instance, inputs, clients) => {
  console.log(
    `Verifying API Gateway custom domain ${inputs.domain} is mapped to API ID: ${instance.state.apiId}`
  );

  let apiMapping;
  const paramsGet = {
    DomainName: instance.state.domain,
  };
  const apiMappings = await clients.apig.getApiMappings(paramsGet).promise();
  apiMappings.Items.forEach((am) => {
    if (am.ApiId === instance.state.apiId) {
      apiMapping = am;
    }
  });

  if (apiMapping) {
    console.log(`API Mapping found with API Mapping ID: ${apiMapping.ApiMappingId}`);
    return apiMapping.ApiMappingId;
  }

  try {
    console.log('API Mapping to API Custom Domain not found.  Creating one...');
    const createApiMappingParams = {
      DomainName: inputs.domain,
      ApiId: instance.state.apiId,
      Stage: '$default',
    };
    const resMapping = await clients.apig.createApiMapping(createApiMappingParams).promise();
    console.log(`API Mapping successfully created with ID: ${resMapping.ApiMappingId}`);
    return resMapping.ApiMappingId;
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log('AWS API Gateway is throttling our API requests.  Sleeping for 2 seconds...');
      await sleep(2000);
      return findOrCreateApiMapping(instance, inputs, clients);
    }
    if (e.code === 'ConflictException') {
      throw new Error(`The domain ${inputs.domain} is already in use by another API`);
    }
    throw e;
  }
};

/**
 *
 *
 * Create Or Update Logic
 *
 *
 */

/*
 * Ensure the provided or default IAM Role exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateFunctionRole = async (instance, inputs, clients) => {
  // Verify existing role, either provided or the previously created default role...
  if (inputs.roleName) {
    console.log(
      `Verifying the provided IAM Role with the name: ${inputs.roleName} in the inputs exists...`
    );

    const userRole = await clients.extras.getRole({ roleName: inputs.roleName });
    const userRoleArn = userRole && userRole.Role && userRole.Role.Arn ? userRole.Role.Arn : null; // Don't save user provided role to state, always reference it as an input, in case it changes

    // If user role exists, save it to state so it can be used for the create/update lambda logic later
    if (userRoleArn) {
      console.log(`The provided IAM Role with the name: ${inputs.roleName} in the inputs exists.`);
      instance.state.userRoleArn = userRoleArn;

      // Save AWS Account ID by fetching the role ID
      // TODO: This may not work with cross-account roles.
      instance.state.awsAccountId = instance.state.userRoleArn.split(':')[4];
    } else {
      throw new Error(
        `The provided IAM Role with the name: ${inputs.roleName} could not be found.`
      );
    }
  } else {
    // Create a default role with basic Lambda permissions

    const defaultLambdaRoleName = `${instance.state.name}-lambda-role`;
    console.log(
      `IAM Role not found.  Creating or updating a default role with the name: ${defaultLambdaRoleName}`
    );

    const result = await clients.extras.deployRole({
      roleName: defaultLambdaRoleName,
      service: ['lambda.amazonaws.com'],
      policy: getDefaultLambdaRolePolicyArn(),
    });

    instance.state.defaultLambdaRoleName = defaultLambdaRoleName;
    instance.state.defaultLambdaRoleArn = result.roleArn;
    instance.state.awsAccountId = instance.state.defaultLambdaRoleArn.split(':')[4];

    console.log(
      `Default Lambda IAM Role created or updated with ARN ${instance.state.defaultLambdaRoleArn}`
    );
  }
};

/*
 * Ensure the Meta IAM Role exists
 */
const createOrUpdateMetaRole = async (instance, inputs, clients, serverlessAccountId) => {
  // Create or update Meta Role for monitoring and more, if option is enabled.  It's enabled by default.
  if (inputs.monitoring || typeof inputs.monitoring === 'undefined') {
    console.log('Creating or updating the meta IAM Role...');

    const roleName = `${instance.state.name}-meta-role`;

    const assumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: {
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::${serverlessAccountId}:root`, // Serverless's Components account
        },
        Action: 'sts:AssumeRole',
      },
    };

    // Create a policy that only can access APIGateway and Lambda metrics, logs from CloudWatch...
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Resource: '*',
          Action: [
            'cloudwatch:Describe*',
            'cloudwatch:Get*',
            'cloudwatch:List*',
            'logs:Get*',
            'logs:List*',
            'logs:Describe*',
            'logs:TestMetricFilter',
            'logs:FilterLogEvents',
          ],
          // TODO: Finish this.  Haven't been able to get this to work.  Perhaps there is a missing service (Cloudfront?)
          // Condition: {
          //   StringEquals: {
          //     'cloudwatch:namespace': [
          //       'AWS/ApiGateway',
          //       'AWS/Lambda'
          //     ]
          //   }
          // }
        },
      ],
    };

    const roleDescription = `The Meta Role for the Serverless Framework App: ${instance.name} Stage: ${instance.stage}`;

    const result = await clients.extras.deployRole({
      roleName,
      roleDescription,
      policy,
      assumeRolePolicyDocument,
    });

    instance.state.metaRoleName = roleName;
    instance.state.metaRoleArn = result.roleArn;

    console.log(`Meta IAM Role created or updated with ARN ${instance.state.metaRoleArn}`);
  }
};

/*
 * Ensures the AWS Lambda function exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateLambda = async (instance, inputs, clients) => {
  // Verify existing lambda
  if (instance.state.lambdaArn && instance.state.lambdaName) {
    console.log(
      `Verifying the AWS Lambda with the ARN: ${instance.state.lambdaArn} and Name: ${instance.state.lambdaName} found in state exists...`
    );
    instance.state.lambdaArn = await getLambda(clients, instance.state.lambdaName);
  }

  if (!instance.state.lambdaArn) {
    instance.state.lambdaName = `${instance.state.name}-function`; // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY NEW FUNCTIONS, RATHER THAN UPDATE THEIR OLD ONES.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
    console.log(
      `No AWS Lambda function found.  Creating one with the name: ${instance.state.lambdaName}`
    );
    return createLambda(instance, inputs, clients);
  }

  console.log("AWS Lambda function found.  Updating it's configuration and code...");
  await updateLambdaConfig(instance, inputs, clients);
  await updateLambdaCode(instance, inputs, clients);
  console.log(`AWS Lambda version "${instance.state.lambdaVersion}" published`);
  console.log(`AWS Lambda function updated with ARN: ${instance.state.lambdaArn}`);
  return null;
};

/*
 * Adds permission to API Gateway to invoke the latest lambda version/alias
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const addPermission = async (instance, inputs, clients) => {
  const lambdaArn = instance.state.aliasArn;
  const apigArn = `arn:aws:execute-api:${instance.state.region}:${instance.state.awsAccountId}:${instance.state.apiId}/*/*`;
  console.log(`Add permission to Lambda enabling API Gateway with this ARN to call it: ${apigArn}`);
  const paramsPermission = {
    Action: 'lambda:InvokeFunction',
    FunctionName: lambdaArn,
    Principal: 'apigateway.amazonaws.com',
    SourceArn: apigArn,
    StatementId: `API-${instance.state.apiId}-${inputs.alias}`,
  };
  try {
    await clients.lambda.addPermission(paramsPermission).promise();
    console.log('Permission successfully added to AWS Lambda for API Gateway');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      throw e;
    }
  }
};

/*
 * Creates an API on aws if it doesn't already exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateApi = async (instance, inputs, clients) => {
  let apiId;
  if (instance.state.apiId) {
    console.log(`Checking for existing API with ID: ${instance.state.apiId}`);
    const paramsGet = { ApiId: instance.state.apiId };
    try {
      const res = await clients.apig.getApi(paramsGet).promise();
      apiId = res.ApiId;
    } catch (error) {
      if (error.code !== 'NotFoundException') {
        throw error;
      }
    }
  }

  // use the alias if defined for traffic control, or the latest lambda arn
  const lambdaArn = instance.state.aliasArn;

  if (apiId) {
    console.log(`API found. Updating API with ID: ${instance.state.apiId}...`);

    // Ensure this is on state
    instance.state.apiId = apiId;
    instance.state.apiGatewayUrl = `https://${instance.state.apiId}.execute-api.${instance.state.region}.amazonaws.com`;

    const updateApiParams = {
      ApiId: apiId,
      Description: inputs.description || getDefaultDescription(instance),
      Target: `arn:aws:apigateway:${instance.state.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
    };

    await clients.apig.updateApi(updateApiParams).promise();

    // update permissions for the new lambda version
    await addPermission(instance, inputs, clients);

    console.log(`API with ID "${instance.state.apiId}" Updated.`);
    return;
  }

  instance.state.apiName = `${instance.name}-api`; // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY A NEW API, RATHER THAN UPDATE THEIR OLD ONE.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
  console.log(`API not found. Creating API with name: ${instance.state.apiName}...`);
  const createApiParams = {
    Name: instance.state.apiName,
    ProtocolType: 'HTTP',
    // CredentialsArn: inputs.roleName || instance.state.defaultLambdaRoleArn,
    Description: inputs.description || getDefaultDescription(instance),
    Target: `arn:aws:apigateway:${instance.state.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
  };

  const res = await clients.apig.createApi(createApiParams).promise();
  instance.state.apiId = res.ApiId;

  console.log(`API ${instance.state.apiName} created with ID ${instance.state.apiId}`);

  instance.state.apiGatewayUrl = `https://${instance.state.apiId}.execute-api.${instance.state.region}.amazonaws.com`;

  // Give newly created API permission to call Lambda
  await addPermission(instance, inputs, clients);
};

/*
 * Creates an API on aws if it doesn't already exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateDomain = async (instance, inputs, clients) => {
  instance.state.domain = inputs.domain;

  instance.state.domainHostedZoneId = await getDomainHostedZoneId(instance, inputs, clients);

  instance.state.certificateArn = await findOrCreateCertificate(instance, clients);

  // if certificate is not valid, then we cannot create the domain name
  // the user has to manually validate the certificate
  if (!instance.state.certificateValid) {
    delete instance.state.domain;
    return;
  }

  const domain = await findOrCreateCustomDomain(instance, inputs, clients);
  instance.state.apigatewayHostedZoneId = domain.apigatewayHostedZoneId;
  instance.state.apigatewayDomainName = domain.apigatewayDomainName;

  const mappingId = await findOrCreateApiMapping(instance, inputs, clients);
  instance.state.apiMappingId = mappingId;

  if (instance.state.domainHostedZoneId) {
    await ensureRecordSetForApiGCustomDomain(instance, inputs, clients);
  }
};

/**
 *
 *
 * Removal Logic
 *
 *
 */

/*
 * Removes the Function & Meta Roles from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeAllRoles = async (instance, clients) => {
  // Delete Function Role
  if (instance.state.defaultLambdaRoleName) {
    console.log('Deleting the default Function Role...');
    await clients.extras.removeRole({
      roleName: instance.state.defaultLambdaRoleName,
    });
  }

  // Delete Meta Role
  if (instance.state.metaRoleName) {
    console.log('Deleting the Meta Role...');
    await clients.extras.removeRole({
      roleName: instance.state.metaRoleName,
    });
  }
};

/*
 * Removes a lambda function from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeLambda = async (instance, clients) => {
  if (!instance.state.lambdaName) {
    return;
  }

  console.log(`Removing lambda with arn ${instance.state.lambdaArn}`);

  try {
    const params = { FunctionName: instance.state.lambdaName };
    await clients.lambda.deleteFunction(params).promise();
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') {
      throw error;
    }
  }
};

/**
 * Remove Mapping between API Gateway Custom Domain & HTTP API.  This has to be removed before API Gateway Custom Domain can be deleted.
 */
const removeApiMapping = async (instance, clients) => {
  if (!instance.state.apiMappingId || !instance.state.domain) {
    return;
  }

  console.log(
    `Removing API Mapping with ID ${instance.state.apiMappingId} and domain ${instance.state.domain}`
  );

  const params = {
    ApiMappingId: instance.state.apiMappingId,
    DomainName: instance.state.domain,
  };

  await clients.apig.deleteApiMapping(params).promise();
};

/*
 * Removes an API from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeApi = async (instance, clients) => {
  if (!instance.state.apiId) {
    return;
  }

  console.log(`Removing API with ID ${instance.state.apiId}`);

  try {
    await clients.apig.deleteApi({ ApiId: instance.state.apiId }).promise();
  } catch (e) {
    console.log(e);
  }
};

/**
 * Remove API Gateway Domain
 */
const removeDomainFromApig = async (instance, clients) => {
  if (!instance.state.domain) {
    return;
  }

  console.log(`Removing domain ${instance.state.domain} from API Gateway`);

  const params = {
    DomainName: instance.state.domain,
  };

  await clients.apig.deleteDomainName(params).promise();
};

/**
 * Remove API Gateway Domain DNS Records
 */
const removeDnsRecordsForApigDomain = async (instance, clients) => {
  if (
    !instance.state.domain ||
    !instance.state.domainHostedZoneId ||
    !instance.state.apigatewayDomainName
  ) {
    return;
  }

  console.log(`Removing DNS records for domain ${instance.state.domain}`);

  const dnsRecord = {
    HostedZoneId: instance.state.domainHostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: 'DELETE',
          ResourceRecordSet: {
            Name: instance.state.domain,
            Type: 'A',
            AliasTarget: {
              HostedZoneId: instance.state.apigatewayHostedZoneId,
              DNSName: instance.state.apigatewayDomainName,
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  };

  await clients.route53.changeResourceRecordSets(dnsRecord).promise();
};

/**
 * Remove a custom domain
 */
const removeDomain = async (instance, clients) => {
  await removeApiMapping(instance, clients);
  await removeDomainFromApig(instance, clients);
  await removeDnsRecordsForApigDomain(instance, clients);
};

/**
 *
 *
 * Metrics Logic
 *
 *
 */

/**
 * Get metrics from cloudwatch
 * @param {*} clients
 * @param {*} rangeStart
 * @param {*} rangeEnd
 */
const getMetrics = async (region, metaRoleArn, apiId, functionName, rangeStart, rangeEnd) => {
  /**
   * Create AWS STS Token via the meta role that is deployed with the Express Component
   */

  // Assume Role
  const assumeParams = {};
  assumeParams.RoleSessionName = `session${Date.now()}`;
  assumeParams.RoleArn = metaRoleArn;
  assumeParams.DurationSeconds = 900;

  const sts = new AWS.STS({ region });
  const resAssume = await sts.assumeRole(assumeParams).promise();

  const roleCreds = {};
  roleCreds.accessKeyId = resAssume.Credentials.AccessKeyId;
  roleCreds.secretAccessKey = resAssume.Credentials.SecretAccessKey;
  roleCreds.sessionToken = resAssume.Credentials.SessionToken;

  const resources = [
    {
      type: 'aws_http_api',
      apiId,
    },
    {
      type: 'aws_lambda',
      functionName,
    },
  ];

  /**
   * Instantiate a new Extras instance w/ the temporary credentials
   */

  const extras = new AWS.Extras({
    credentials: roleCreds,
    region,
  });

  return await extras.getMetrics({
    rangeStart,
    rangeEnd,
    resources,
  });
};

/*
 * Fetches the lambda alias that the user specified
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getAlias = async (instance, inputs, clients) => {
  try {
    const getAliasParams = {
      FunctionName: instance.state.lambdaName,
      Name: inputs.alias,
    };

    const getAliasRes = await clients.lambda.getAlias(getAliasParams).promise();
    return getAliasRes.AliasArn;
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      return null;
    }
    throw e;
  }
};

/*
 * Fetches the function version of the specified alias
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getAliasFunctionVersion = async (instance, inputs, clients) => {
  try {
    const getAliasParams = {
      FunctionName: instance.state.lambdaName,
      Name: 'default',
    };

    const getAliasRes = await clients.lambda.getAlias(getAliasParams).promise();
    return getAliasRes.FunctionVersion;
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      throw new Error('The specified traffic destination does not exist');
    }
    throw e;
  }
};

/*
 * Gets a clean AWS Routing Config object based on the traffic config
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getRoutingConfig = async (instance, inputs, clients) => {
  // return null if user did not define any canary deployments settings
  if (inputs.alias !== 'feature') {
    return null;
  }

  const additionalVersion = await getAliasFunctionVersion(instance, inputs, clients);

  const routingConfig = {
    AdditionalVersionWeights: {},
  };

  // if the user specified 0.2 traffic for this feature codebase/deployment
  // that means redirect 0.8 to the default alias
  routingConfig.AdditionalVersionWeights[additionalVersion] = 1 - inputs.traffic;

  return routingConfig;
};

/*
 * Creates or updates default or feature alias
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateAlias = async (instance, inputs, clients) => {
  inputs.alias = 'default';

  if (inputs.traffic && Number(instance.state.lambdaVersion) > 1) {
    inputs.alias = 'feature';
  }

  console.log(`Verifying alias "${inputs.alias}"...`);
  instance.state.aliasArn = await getAlias(instance, inputs, clients);

  const aliasParams = {
    FunctionName: instance.state.lambdaName,
    Name: inputs.alias,
    FunctionVersion: instance.state.lambdaVersion,
  };

  const userDefinedRoutingConfig = await getRoutingConfig(instance, inputs, clients);

  if (userDefinedRoutingConfig) {
    aliasParams.RoutingConfig = userDefinedRoutingConfig;
    console.log(
      `Shifting ${String(inputs.traffic * 100)}% of the traffic to the "${inputs.alias}" alias...`
    );
  }

  if (instance.state.aliasArn) {
    console.log(`Alias "${inputs.alias}" found. Updating...`);
    instance.state.aliasArn = (await clients.lambda.updateAlias(aliasParams).promise()).AliasArn;
    console.log(`Alias "${inputs.alias}" updated.`);
  } else {
    console.log(`Alias "${inputs.alias}" not found. Creating...`);
    instance.state.aliasArn = (await clients.lambda.createAlias(aliasParams).promise()).AliasArn;
    console.log(`Alias "${inputs.alias}" created.`);
  }

  return instance.state.aliasArn;
};

const retryIfRateExceeded = async (awsOperation, attempts = 10) => {
  // after 10 attempts, just exist!
  if (attempts === 0) {
    throw new Error('Throttled by AWS despite 10 retry attempts.');
  }
  try {
    return await awsOperation();
  } catch (e) {
    if (e.message.includes('Rate exceeded')) {
      // sleep for a certain period according to
      // the number of retry attempts performed so far
      // the more attempts, the more sleep.
      await sleep(Math.floor(10000 / attempts));

      return retryIfRateExceeded(awsOperation, --attempts);
    }
    throw e;
  }
};

module.exports = {
  generateId,
  sleep,
  getClients,
  packageExpress,
  createOrUpdateFunctionRole,
  createOrUpdateMetaRole,
  createOrUpdateLambda,
  createOrUpdateApi,
  createOrUpdateDomain,
  createOrUpdateAlias,
  removeApi,
  removeAllRoles,
  removeLambda,
  removeDomain,
  getMetrics,
  retryIfRateExceeded,
};
