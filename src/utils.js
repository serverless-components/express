'use strict'

const path = require('path')
const AWS = require('aws-sdk')
const moment = require('moment')
const https = require('https')

const agent = new https.Agent({
  keepAlive: true
})

const { readFile, copySync } = require('fs-extra')

/*
 * Pauses execution for the provided miliseconds
 *
 * @param ${number} wait - number of miliseconds to wait
 */
const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait))

/*
 * Generates a random id
 */
const generateId = () =>
  Math.random()
    .toString(36)
    .substring(6)

/**
 * Generate a default description for resources
 * @param {*} instance
 */
const getDefaultDescription = (instance) => {
  return `A resource of the Serverless Express Component for ${instance.org} - ${instance.stage} - ${instance.app} - ${instance.name}`
}

/**
 * The ARN of the Lambda IAM Policy used for the default IAM Role
 */
const getDefaultLambdaRolePolicyArn = () => {
  return 'arn:aws:iam::aws:policy/AWSLambdaFullAccess'
}

/*
 * Initializes an AWS SDK and returns the relavent service clients
 *
 * @param ${object} credentials - aws credentials object
 * @param ${string} region - aws region
 */
const getClients = (credentials, region = 'us-east-1') => {
  AWS.config.update({
    httpOptions: {
      agent
    }
  })

  const iam = new AWS.IAM({ credentials, region })
  const lambda = new AWS.Lambda({ credentials, region })
  const apig = new AWS.ApiGatewayV2({ credentials, region })
  const route53 = new AWS.Route53({ credentials, region })
  const acm = new AWS.ACM({
    credentials,
    region: 'us-east-1' // ACM must be in us-east-1
  })

  return {
    iam,
    lambda,
    apig,
    route53,
    acm
  }
}

/*
 * Extracts the naked second level domain (ie. serverless.com) from
 * the provided domain or subdomain (ie. api.serverless.com)
 *
 * @param ${string} domain - the domain input that the user provided
 */
const getNakedDomain = (domain) => {
  if (!domain) {
    return null
  }
  const domainParts = domain.split('.')
  const topLevelDomainPart = domainParts[domainParts.length - 1]
  const secondLevelDomainPart = domainParts[domainParts.length - 2]
  return `${secondLevelDomainPart}.${topLevelDomainPart}`
}

/*
 * Packages express app and injects shims and sdk
 *
 * @param ${instance} instance - the component instance
 * @param ${object} config - the component config
 */
const packageExpress = async (instance, inputs, outputs) => {
  console.log('Packaging Express.js application...')

  // unzip source zip file
  console.log(`Unzipping ${inputs.src || 'files'}...`)
  const sourceDirectory = await instance.unzip(inputs.src)
  console.log(`Files unzipped into ${sourceDirectory}...`)

  // add shim to the source directory
  console.log('Installing Express + AWS Lambda handler...')
  copySync(path.join(__dirname, '_express'), path.join(sourceDirectory, '_express'))

  // Attempt to infer data from the application
  if (inputs.inference) { await infer(instance, inputs, outputs, sourceDirectory) }

  // add sdk to the source directory, add original handler
  console.log('Installing Serverless Framework SDK...')
  instance.state.handler = await instance.addSDK(sourceDirectory, '_express/handler.handler')

  if (!inputs.src) {
    // add default express app
    console.log('Installing Default Express App...')
    copySync(path.join(__dirname, '_src'), path.join(sourceDirectory, '_src'))
  }
  // zip the source directory with the shim and the sdk

  console.log('Zipping files...')
  const zipPath = await instance.zip(sourceDirectory)
  console.log(`Files zipped into ${zipPath}...`)

  // save the zip path to state for lambda to use it
  instance.state.zipPath = zipPath

  return zipPath
}

/*
 * Infer data from the Application by attempting to intiatlize it during deployment and extracting data.
 *
 * @param ${object} instance - the component instance
 * @param ${object} inputs - the component inputs
 */
const infer = async (instance, inputs, outputs, sourceDirectory) => {

  // Initialize application
  let app
  try {
    app = require(path.join(sourceDirectory, './app.js'))
  } catch (error) {
    const msg = error.message
    error.message = `Inference failed.  To fix this, you can turn off inferencing by specifying "inputs.inference: false" or fix the following issue: ${msg}`
    throw error
  }

  try { await generateOpenAPI(instance, inputs, outputs, app) }
  catch (error) {
    const msg = error.message
    error.message = `Inference was unable to generate an OpenAPI specification for your application.  To fix this, you can turn off inferencing by specifying "inputs.inference: false" or fix the following issue: ${msg}`
    throw error
  }
}

/*
 * Generate an OpenAPI specification from the Application
 *
 * @param ${object} instance - the component instance
 * @param ${object} inputs - the component inputs
 */
const generateOpenAPI = async (instance, inputs, outputs, app) => {

  // Open API Version 3.0.3, found here: https://swagger.io/specification/
  // TODO: This is not complete, but the pieces that do exist are accurate.
  const openApi = {
    openapi: '3.0.3',
    info: {
      // title: null,
      // description: null,
      version: '0.0.1'
    },
    paths: {},
  }

  // Parts of the OpenAPI spec that we may use these at a later date.
  // For now, they are unincorporated.
  const oaServersObject = {
    url: null,
    description: null,
    variables: {}
  }
  const oaComponentsObject = {
    schemas: {},
    responses: {},
    parameters: {},
    examples: {},
    requestBodies: {},
    headers: {},
    securitySchemes: {},
    links: {},
    callbacks: {}
  }
  const oaPathItem = {
    description: null,
    summary: null,
    operationId: null,
    responses: {}
  }

  if (app && app._router && app._router.stack && app._router.stack.length) {
    app._router.stack.forEach((route) => {

      // This array holds all middleware layers, which include routes and more
      // First check if this 'layer' is an express route type, otherwise skip
      if (!route.route) return

      // Define key data
      const ePath = route.route.path

      if (['*', '/*'].indexOf(ePath) > -1) {
        return
      }

      // Save path
      openApi.paths[ePath] = openApi.paths[ePath] || {}

      for (const method in route.route.methods) {
        // Save method
        openApi.paths[ePath][method] = {}
      }
    })
  }

  // Save to outputs
  outputs.api = openApi
}

/*
 * Fetches the role from AWS to validate its existance
 */
const getRole = async (clients, roleName) => {
  try {
    const res = await clients.iam.getRole({ RoleName: roleName }).promise()
    return res.Role.Arn
  } catch (e) {
    if (e.message.includes('cannot be found')) {
      return null
    }
    throw e
  }
}

/*
 * Fetches a lambda function by ARN
 */
const getLambda = async (clients, lambdaName) => {
  try {
    const res = await clients.lambda
      .getFunctionConfiguration({
        FunctionName: lambdaName
      })
      .promise()
    return res.FunctionArn
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      return null
    }
    throw e
  }
}

/*
 * Creates a lambda function on aws
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createLambda = async (instance, inputs, clients) => {
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
      Variables: inputs.env || {}
    }
  }

  if (inputs.layers) {
    params.Layers = inputs.layers
  }

  params.Code.ZipFile = await readFile(instance.state.zipPath)

  try {
    const res = await clients.lambda.createFunction(params).promise()
    console.log(`Lambda created with ARN ${res.FunctionArn}`)
    instance.state.lambdaArn = res.FunctionArn
    instance.state.lambdaVersion = res.Version
  } catch (e) {
    if (
      e.message.includes('The role defined for the function cannot be assumed by Lambda') ||
      e.message.includes(
        'Lambda was unable to configure access to your environment variables because the KMS key is invalid'
      )
    ) {
      // we need to wait around 2 seconds after the role is created before it can be assumed
      await sleep(2000)
      return createLambda(instance, inputs, clients)
    }
    throw e
  }
}

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
    Publish: true
  }
  functionCodeParams.ZipFile = await readFile(instance.state.zipPath)
  const res = await clients.lambda.updateFunctionCode(functionCodeParams).promise()
  instance.state.lambdaArn = res.FunctionArn
  instance.state.lambdaVersion = res.Version
}

/*
 * Updates lambda code on aws according to the provided config
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const updateLambdaConfig = async (instance, inputs, clients) => {
  const functionConfigParams = {
    FunctionName: instance.state.lambdaName,
    Description: inputs.description || getDefaultDescription(instance),
    MemorySize: inputs.memory || 1536,
    Role: instance.state.userRoleArn || instance.state.defaultLambdaRoleArn, // Default to auto-create role
    Timeout: inputs.timeout || 29, // Meet APIG timeout limit, don't exceed it
    Handler: instance.state.handler,
    Runtime: 'nodejs12.x',
    Environment: {
      Variables: inputs.env || {}
    }
  }

  if (inputs.layers) {
    functionConfigParams.Layers = inputs.layers
  }

  try {
    const res = await clients.lambda.updateFunctionConfiguration(functionConfigParams).promise()
    return res.FunctionArn
  } catch (e) {
    if (
      e.message.includes('The role defined for the function cannot be assumed by Lambda') ||
      e.message.includes(
        'Lambda was unable to configure access to your environment variables because the KMS key is invalid'
      )
    ) {
      // we need to wait around 2 seconds after the role is created before it can be assumed
      await sleep(2000)
      return updateLambdaConfig(instance, inputs, clients)
    }
    throw e
  }
}

/**
 * Get the Hosted Zone ID of the custom domain in Route 53
 */
const getDomainHostedZoneId = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)

  instance.state.nakedDomain = nakedDomain

  console.log(`Getting Route53 Hosted Zone ID for domain: ${nakedDomain}`)

  const hostedZones = await clients.route53.listHostedZonesByName().promise()

  let hostedZone = hostedZones.HostedZones.find(
    // Name has a period at the end, so we're using includes rather than equals
    (zone) => zone.Name.includes(nakedDomain)
  )

  if (!hostedZone) {
    console.log(`Domain ${nakedDomain} was not found in your AWS account. Skipping DNS operations.`)
    return
  }

  hostedZone = hostedZone.Id.replace('/hostedzone/', '') // hosted zone id is always prefixed with this :(

  console.log(`Domain hosted zone id for ${nakedDomain} is ${hostedZone}`)

  return hostedZone
}

const getCertificateArnByDomain = async (clients, instance) => {
  const listRes = await clients.acm.listCertificates().promise()
  const certificate = listRes.CertificateSummaryList.find(
    (cert) => cert.DomainName === instance.state.nakedDomain
  )
  return certificate && certificate.CertificateArn ? certificate.CertificateArn : null
}

const getCertificateValidationRecord = (certificate, domain) => {
  if (!certificate.DomainValidationOptions) {
    return null
  }
  const domainValidationOption = certificate.DomainValidationOptions.find(
    (option) => option.DomainName === domain
  )

  return domainValidationOption.ResourceRecord
}

const describeCertificateByArn = async (clients, certificateArn, domain) => {
  const res = await clients.acm.describeCertificate({ CertificateArn: certificateArn }).promise()
  const certificate = res && res.Certificate ? res.Certificate : null

  if (
    certificate.Status === 'PENDING_VALIDATION' &&
    !getCertificateValidationRecord(certificate, domain)
  ) {
    await sleep(1000)
    return describeCertificateByArn(clients, certificateArn, domain)
  }

  return certificate
}

const findOrCreateCertificate = async (instance, clients) => {
  const wildcardSubDomain = `*.${instance.state.nakedDomain}`

  const params = {
    DomainName: instance.state.nakedDomain,
    SubjectAlternativeNames: [instance.state.nakedDomain, wildcardSubDomain],
    ValidationMethod: 'DNS'
  }

  console.log(`Checking if a certificate for the ${instance.state.nakedDomain} domain exists`)
  let certificateArn = await getCertificateArnByDomain(clients, instance)

  if (!certificateArn) {
    console.log(
      `Certificate for the ${instance.state.nakedDomain} domain does not exist. Creating...`
    )
    certificateArn = (await clients.acm.requestCertificate(params).promise()).CertificateArn
  }

  const certificate = await describeCertificateByArn(
    clients,
    certificateArn,
    instance.state.nakedDomain
  )

  console.log(
    `Certificate for ${instance.state.nakedDomain} is in a "${certificate.Status}" status`
  )

  if (certificate.Status === 'PENDING_VALIDATION') {
    const certificateValidationRecord = getCertificateValidationRecord(
      certificate,
      instance.state.nakedDomain
    )
    // only validate if domain/hosted zone is found in this account
    if (instance.state.domainHostedZoneId) {
      console.log(`Validating the certificate for the ${instance.state.nakedDomain} domain.`)

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
                    Value: certificateValidationRecord.Value
                  }
                ]
              }
            }
          ]
        }
      }
      await clients.route53.changeResourceRecordSets(recordParams).promise()
      console.log(
        'Your certificate was created and is being validated. It may take a few mins to validate.'
      )
      console.log(
        'Please deploy again after few mins to use your newly validated certificate and activate your domain.'
      )
    } else {
      // if domain is not in account, let the user validate manually
      console.log(
        `Certificate for the ${instance.state.nakedDomain} domain was created, but not validated. Please validate it manually.`
      )
      console.log(`Certificate Validation Record Name: ${certificateValidationRecord.Name} `)
      console.log(`Certificate Validation Record Type: ${certificateValidationRecord.Type} `)
      console.log(`Certificate Validation Record Value: ${certificateValidationRecord.Value} `)
    }
  } else if (certificate.Status === 'ISSUED') {
    // if certificate status is ISSUED, mark it a as valid for CloudFront to use
    instance.state.certificateValid = true
  } else if (certificate.Status === 'SUCCESS') {
    // nothing to do here. We just need to wait a min until the status changes to ISSUED
  } else if (certificate.Status === 'VALIDATION_TIMED_OUT') {
    // if 72 hours passed and the user did not validate the certificate
    // it will timeout and the user will need to recreate and validate the certificate manulaly
    console.log(
      'Certificate validation timed out after 72 hours. Please recreate and validate the certifcate manually.'
    )
    console.log('Your domain will not work until your certificate is created and validated.')
  } else {
    // something else happened?!
    throw new Error(
      `Failed to validate ACM certificate. Unsupported ACM certificate status ${certificate.Status}`
    )
  }

  return certificateArn
}
/**
 * Create a custom domain record in API Gateway
 * @param {*} instance
 * @param {*} inputs
 * @param {*} clients
 */
const createDomainInApig = async (instance, inputs, clients) => {
  console.log(`Domain ${inputs.domain} not found in API Gateway. Creating...`)

  let res
  try {
    const params = {
      DomainName: inputs.domain,
      DomainNameConfigurations: [
        {
          EndpointType: 'REGIONAL', // ApiGateway V2 does not support EDGE endpoints yet (Writte in April 9th 2020)
          SecurityPolicy: 'TLS_1_2',
          CertificateArn: instance.state.certificateArn
        }
      ]
    }
    res = await clients.apig.createDomainName(params).promise()
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log('API Gateway is throttling our API Requests *sigh*.  Sleeping for 2 seconds...')
      await sleep(2000)
      return createDomainInApig(instance, inputs, clients)
    }
    throw e
  }
  return res
}

/**
 * Ensure a Route 53 Hosted Zone AliasTarget Record Set for the HTTP Custom Domain
 * @param {*} instance
 * @param {*} inputs
 * @param {*} clients
 */
const ensureRecordSetForApiGCustomDomain = async (instance, inputs, clients) => {
  console.log(
    `Ensuring the existence of a Route 53 Hosted Zone AliasTarget Record Set for HTTP API with a Hosted Zone ID: ${instance.state.apigatewayHostedZoneId} and DNS Name: ${instance.state.apigatewayDomainName}.`
  )

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
              EvaluateTargetHealth: false
            }
          }
        }
      ]
    }
  }

  try {
    await clients.route53.changeResourceRecordSets(changeParams).promise()
  } catch (error) {
    console.error(error)
  }
}

/**
 * Find or create a custom domain on API Gateway
 */
const findOrCreateCustomDomain = async (instance, inputs, clients) => {
  const result = {}
  // Find or create custom domain on API Gateway
  try {
    console.log(`Verifying Custom Domain exists on API Gateway: ${inputs.domain}...`)
    const params = { DomainName: inputs.domain }
    const domain = await clients.apig.getDomainName(params).promise()
    result.apigatewayHostedZoneId = domain.DomainNameConfigurations[0].HostedZoneId
    result.apigatewayDomainName = domain.DomainNameConfigurations[0].ApiGatewayDomainName
    return result
  } catch (error) {
    if (error.code === 'NotFoundException') {
      console.log(`Custom Domain not found in API Gateway: ${inputs.domain}.  Creating it...`)
      const res = await createDomainInApig(instance, inputs, clients)
      result.apigatewayHostedZoneId = res.DomainNameConfigurations[0].HostedZoneId
      result.apigatewayDomainName = res.DomainNameConfigurations[0].ApiGatewayDomainName
      console.log(
        `Domain ${instance.state.domain} successfully created. If this is your first deploy, please note that you will have to wait typical DNS propagation times for your domain name to be accessible.  This is often only 10-20 minutes, but on occassion can take ~4 hours.`
      )
      return result
    }
    throw error
  }
}

/**
 * Ensure API Gateway API is mapped to the custom API Gateway Domain
 */
const findOrCreateApiMapping = async (instance, inputs, clients) => {
  console.log(
    `Verifying API Gateway custom domain ${inputs.domain} is mapped to API ID: ${instance.state.apiId}`
  )

  let apiMapping
  const paramsGet = {
    DomainName: instance.state.domain
  }
  const apiMappings = await clients.apig.getApiMappings(paramsGet).promise()
  apiMappings.Items.forEach((am) => {
    if (am.ApiId === instance.state.apiId) {
      apiMapping = am
    }
  })

  if (apiMapping) {
    console.log(`API Mapping found with API Mapping ID: ${apiMapping.ApiMappingId}`)
    return apiMapping.ApiMappingId
  }

  try {
    console.log('API Mapping to API Custom Domain not found.  Creating one...')
    const createApiMappingParams = {
      DomainName: inputs.domain,
      ApiId: instance.state.apiId,
      Stage: '$default'
    }
    const resMapping = await clients.apig.createApiMapping(createApiMappingParams).promise()
    console.log(`API Mapping successfully created with ID: ${resMapping.ApiMappingId}`)
    return resMapping.ApiMappingId
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log('AWS API Gateway is throttling our API requests.  Sleeping for 2 seconds...')
      await sleep(2000)
      return findOrCreateApiMapping(instance, inputs, clients)
    }
    if (e.code === 'ConflictException') {
      throw new Error(`The domain ${inputs.domain} is already in use by another API`)
    }
    throw e
  }
}

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
    )

    const userRoleArn = await getRole(clients, inputs.roleName) // Don't save user provided role to state, always reference it as an input, in case it changes

    // If user role exists, save it to state so it can be used for the create/update lambda logic later
    if (userRoleArn) {
      console.log(`The provided IAM Role with the name: ${inputs.roleName} in the inputs exists.`)
      instance.state.userRoleArn = userRoleArn

      // Save AWS Account ID by fetching the role ID
      // TODO: This may not work with cross-account roles.
      instance.state.awsAccountId = instance.state.userRoleArn.split(':')[4]
    } else {
      throw new Error(`The provided IAM Role with the name: ${inputs.roleName} could not be found.`)
    }
  }

  if (!inputs.roleName && instance.state.defaultLambdaRoleArn) {
    console.log(
      `Verifying the default IAM Role found in state exists with the name: ${instance.state.defaultLambdaRoleName}...`
    )
    instance.state.defaultLambdaRoleArn = await getRole(
      clients,
      instance.state.defaultLambdaRoleName
    )
    instance.state.awsAccountId = instance.state.defaultLambdaRoleArn.split(':')[4]
  }

  // Create a default lambda role...
  if (!inputs.roleName && !instance.state.defaultLambdaRoleArn) {
    instance.state.defaultLambdaRoleName = `${instance.state.name}-lambda-role`
    console.log(
      `IAM Role not found.  Creating a default role with the name: ${instance.state.defaultLambdaRoleName}`
    )

    const assumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: {
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com']
        },
        Action: 'sts:AssumeRole'
      }
    }
    const resLambda = await clients.iam
      .createRole({
        RoleName: instance.state.defaultLambdaRoleName,
        Path: '/',
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument)
      })
      .promise()

    instance.state.defaultLambdaRoleArn = resLambda.Role.Arn
    instance.state.awsAccountId = instance.state.defaultLambdaRoleArn.split(':')[4]

    await clients.iam
      .attachRolePolicy({
        RoleName: instance.state.defaultLambdaRoleName,
        PolicyArn: getDefaultLambdaRolePolicyArn()
      })
      .promise()

    console.log(`Default Lambda IAM Role created with ARN ${instance.state.defaultLambdaRoleArn}`)
  }
}

/*
 * Ensure the Meta IAM Role exists
 */
const createOrUpdateMetaRole = async (instance, inputs, clients, serverlessAccountId) => {
  // Create Meta Role for monitoring and more, if option is enabled.  It's enabled by default.
  if (inputs.monitoring || typeof inputs.monitoring === 'undefined') {
    // If meta role is in state, check if it exists already...
    if (instance.state.metaRoleArn) {
      console.log(
        `Verifying the meta IAM Role found in state exists with the name: ${instance.state.metaRoleArn}...`
      )
      instance.state.metaRoleArn = await getRole(clients, instance.state.metaRoleName)
    }

    // If it doesn't exist, create it...
    if (!instance.state.metaRoleName) {
      console.log('Meta IAM Role does not exist.  Creating one...')

      instance.state.metaRoleName = `${instance.state.name}-meta-role`
      instance.state.metaRolePolicyName = `${instance.state.name}-meta-policy`

      const assumeRolePolicyDocumentMeta = {
        Version: '2012-10-17',
        Statement: {
          Effect: 'Allow',
          Principal: {
            AWS: `arn:aws:iam::${serverlessAccountId}:root` // Serverless's Components account
          },
          Action: 'sts:AssumeRole'
        }
      }
      const resMeta = await clients.iam
        .createRole({
          RoleName: instance.state.metaRoleName,
          Path: '/',
          AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocumentMeta)
        })
        .promise()

      instance.state.metaRoleArn = resMeta.Role.Arn

      // Create a policy that only can access APIGateway and Lambda metrics, logs from CloudWatch...
      const metaRolePolicy = {
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
              'logs:FilterLogEvents'
            ]
            // TODO: Finish this.  Haven't been able to get this to work.  Perhaps there is a missing service (Cloudfront?)
            // Condition: {
            //   StringEquals: {
            //     'cloudwatch:namespace': [
            //       'AWS/ApiGateway',
            //       'AWS/Lambda'
            //     ]
            //   }
            // }
          }
        ]
      }

      const createPolicyParams = {
        PolicyDocument: JSON.stringify(metaRolePolicy),
        PolicyName: instance.state.metaRolePolicyName /* required */,
        Description: 'A policy for the Serverless Express Component to access metrics and more'
      }
      const resPolicy = await clients.iam.createPolicy(createPolicyParams).promise()

      instance.state.metaRolePolicyArn = resPolicy.Policy.Arn

      // Attach it to the role...
      await clients.iam
        .attachRolePolicy({
          RoleName: instance.state.metaRoleName,
          PolicyArn: instance.state.metaRolePolicyArn
        })
        .promise()
    }
  }
}

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
    )
    instance.state.lambdaArn = await getLambda(clients, instance.state.lambdaName)
  }

  if (!instance.state.lambdaArn) {
    instance.state.lambdaName = `${instance.state.name}-function` // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY NEW FUNCTIONS, RATHER THAN UPDATE THEIR OLD ONES.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
    console.log(
      `No AWS Lambda function found.  Creating one with the name: ${instance.state.lambdaName}`
    )
    return createLambda(instance, inputs, clients)
  }

  console.log("AWS Lambda function found.  Updating it's configuration and code...")
  await updateLambdaConfig(instance, inputs, clients)
  await updateLambdaCode(instance, inputs, clients)
  console.log(`AWS Lambda version "${instance.state.lambdaVersion}" published`)
  console.log(`AWS Lambda function updated with ARN: ${instance.state.lambdaArn}`)
}

/*
 * Adds permission to API Gateway to invoke the latest lambda version/alias
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const addPermission = async (instance, inputs, clients) => {
  const lambdaArn = instance.state.aliasArn
  const apigArn = `arn:aws:execute-api:${instance.state.region}:${instance.state.awsAccountId}:${instance.state.apiId}/*/*`
  console.log(`Add permission to Lambda enabling API Gateway with this ARN to call it: ${apigArn}`)
  const paramsPermission = {
    Action: 'lambda:InvokeFunction',
    FunctionName: lambdaArn,
    Principal: 'apigateway.amazonaws.com',
    SourceArn: apigArn,
    StatementId: `API-${instance.state.apiId}-${inputs.alias}`
  }
  try {
    await clients.lambda.addPermission(paramsPermission).promise()
    console.log('Permission successfully added to AWS Lambda for API Gateway')
  } catch (e) {
    if (!e.message.includes('already exists')) {
      throw e
    }
  }
}

/*
 * Creates an API on aws if it doesn't already exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateApi = async (instance, inputs, clients) => {
  let apiId
  if (instance.state.apiId) {
    console.log(`Checking for existing API with ID: ${instance.state.apiId}`)
    const paramsGet = { ApiId: instance.state.apiId }
    try {
      const res = await clients.apig.getApi(paramsGet).promise()
      apiId = res.ApiId
    } catch (error) {
      if (error.code !== 'NotFoundException') {
        throw error
      }
    }
  }

  // use the alias if defined for traffic control, or the latest lambda arn
  const lambdaArn = instance.state.aliasArn

  if (apiId) {
    console.log(`API found. Updating API with ID: ${instance.state.apiId}...`)
    const updateApiParams = {
      ApiId: apiId,
      Description: inputs.description || getDefaultDescription(instance),
      Target: `arn:aws:apigateway:${instance.state.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`
    }

    await clients.apig.updateApi(updateApiParams).promise()

    // update permissions for the new lambda version
    await addPermission(instance, inputs, clients)

    console.log(`API with ID "${instance.state.apiId}" Updated.`)
    return
  }

  instance.state.apiName = `${instance.name}-api` // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY A NEW API, RATHER THAN UPDATE THEIR OLD ONE.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
  console.log(`API not found. Creating API with name: ${instance.state.apiName}...`)
  const createApiParams = {
    Name: instance.state.apiName,
    ProtocolType: 'HTTP',
    // CredentialsArn: inputs.roleName || instance.state.defaultLambdaRoleArn,
    Description: inputs.description || getDefaultDescription(instance),
    Target: `arn:aws:apigateway:${instance.state.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`
  }

  const res = await clients.apig.createApi(createApiParams).promise()
  instance.state.apiId = res.ApiId

  console.log(`API ${instance.state.apiName} created with ID ${instance.state.apiId}`)

  instance.state.url = `https://${instance.state.apiId}.execute-api.${instance.state.region}.amazonaws.com`

  // Give newly created API permission to call Lambda
  await addPermission(instance, inputs, clients)
}

/*
 * Creates an API on aws if it doesn't already exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateDomain = async (instance, inputs, clients) => {
  instance.state.domain = inputs.domain

  instance.state.domainHostedZoneId = await getDomainHostedZoneId(instance, inputs, clients)

  instance.state.certificateArn = await findOrCreateCertificate(instance, clients)

  // if certificate is not valid, then we cannot create the domain name
  // the user has to manually validate the certificate
  if (!instance.state.certificateValid) {
    delete instance.state.domain
    return
  }

  const domain = await findOrCreateCustomDomain(instance, inputs, clients)
  instance.state.apigatewayHostedZoneId = domain.apigatewayHostedZoneId
  instance.state.apigatewayDomainName = domain.apigatewayDomainName

  const mappingId = await findOrCreateApiMapping(instance, inputs, clients)
  instance.state.apiMappingId = mappingId

  if (instance.state.domainHostedZoneId) {
    await ensureRecordSetForApiGCustomDomain(instance, inputs, clients)
  }
}

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
  if (instance.state.defaultLambdaRoleArn) {
    console.log('Deleting the default Function Role...')
    try {
      await clients.iam
        .detachRolePolicy({
          RoleName: instance.state.defaultLambdaRoleName,
          PolicyArn: getDefaultLambdaRolePolicyArn()
        })
        .promise()
      await clients.iam
        .deleteRole({
          RoleName: instance.state.defaultLambdaRoleName
        })
        .promise()
    } catch (error) {
      if (error.code !== 'NoSuchEntity') {
        throw error
      }
    }
  }

  // Delete Meta Role
  if (instance.state.metaRoleName && instance.state.metaRolePolicyArn) {
    console.log('Deleting the Meta Role...')
    try {
      await clients.iam
        .detachRolePolicy({
          RoleName: instance.state.metaRoleName,
          PolicyArn: instance.state.metaRolePolicyArn
        })
        .promise()
      await clients.iam
        .deleteRole({
          RoleName: instance.state.metaRoleName
        })
        .promise()
      await clients.iam
        .deletePolicy({
          PolicyArn: instance.state.metaRolePolicyArn
        })
        .promise()
    } catch (error) {
      if (error.code !== 'NoSuchEntity') {
        throw error
      }
    }
  }
}

/*
 * Removes a lambda function from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeLambda = async (instance, clients) => {
  if (!instance.state.lambdaName) {
    return
  }

  console.log(`Removing lambda with arn ${instance.state.lambdaArn}`)

  try {
    const params = { FunctionName: instance.state.lambdaName }
    await clients.lambda.deleteFunction(params).promise()
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') {
      throw error
    }
  }
}

/**
 * Remove Mapping between API Gateway Custom Domain & HTTP API.  This has to be removed before API Gateway Custom Domain can be deleted.
 */
const removeApiMapping = async (instance, clients) => {
  if (!instance.state.apiMappingId) {
    return
  }

  console.log(`Removing API Mapping with ID ${instance.state.apiMappingId}`)

  const params = {
    ApiMappingId: instance.state.apiMappingId,
    DomainName: instance.state.domain
  }

  await clients.apig.deleteApiMapping(params).promise()
}

/*
 * Removes an API from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeApi = async (instance, clients) => {
  if (!instance.state.apiId) {
    return
  }

  console.log(`Removing API with ID ${instance.state.apiId}`)

  try {
    await clients.apig.deleteApi({ ApiId: instance.state.apiId }).promise()
  } catch (e) {
    console.log(e)
  }
}

/**
 * Remove API Gateway Domain
 */
const removeDomainFromApig = async (instance, clients) => {
  if (!instance.state.domain) {
    return
  }

  console.log(`Removing domain ${instance.state.domain} from API Gateway`)

  const params = {
    DomainName: instance.state.domain
  }

  await clients.apig.deleteDomainName(params).promise()
}

/**
 * Remove API Gateway Domain DNS Records
 */
const removeDnsRecordsForApigDomain = async (instance, clients) => {
  if (
    !instance.state.domain ||
    !instance.state.domainHostedZoneId ||
    !instance.state.apigatewayDomainName
  ) {
    return
  }

  console.log(`Removing DNS records for domain ${instance.state.domain}`)

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
              EvaluateTargetHealth: false
            }
          }
        }
      ]
    }
  }

  await clients.route53.changeResourceRecordSets(dnsRecord).promise()
}

/**
 * Remove a custom domain
 */
const removeDomain = async (instance, clients) => {
  await removeApiMapping(instance, clients)
  await removeDomainFromApig(instance, clients)
  await removeDnsRecordsForApigDomain(instance, clients)
}

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
 * @param {*} rangeStart MUST be a moment() object
 * @param {*} rangeEnd MUST be a moment() object
 */
const getMetrics = async (credentials, region, roleArn, apiId, rangeStart, rangeEnd) => {

  /**
   * Validate inputs
   */

  // Validate: ISO8601 timestamps
  if (!moment(rangeStart, moment.ISO_8601).isValid()) {
    throw new Error(`Input "rangeStart" is not a valid IS)8601 timestamp: ${rangeStart}`)
  }
  if (!moment(rangeEnd, moment.ISO_8601).isValid()) {
    throw new Error(`Input "rangeEnd" is not a valid IS)8601 timestamp: ${rangeEnd}`)
  }

  // Convert to Moment.js objects
  rangeStart = moment(rangeStart)
  rangeEnd = moment(rangeEnd)

  // Validate: Start is before End
  if (rangeStart.isAfter(rangeEnd)) {
    throw new Error('The "rangeStart" provided is after the "rangeEnd"')
  }

  // Validate: End is not longer than 30 days
  if (rangeStart.diff(rangeEnd, 'days') > 32) {
    throw new Error(
      `The range cannot be longer than 32 days.  The supplied range is: ${rangeStart.diff(
        rangeEnd,
        'days'
      )}`
    )
  }

  /**
   * Create AWS STS Token
   */

  const sts = new AWS.STS({ region })

  // Assume Role
  const assumeParams = {}
  assumeParams.RoleSessionName = `session${Date.now()}`
  assumeParams.RoleArn = roleArn
  assumeParams.DurationSeconds = 900

  const resAssume = await sts.assumeRole(assumeParams).promise()

  const roleCreds = {}
  roleCreds.accessKeyId = resAssume.Credentials.AccessKeyId
  roleCreds.secretAccessKey = resAssume.Credentials.SecretAccessKey
  roleCreds.sessionToken = resAssume.Credentials.SessionToken
  const cloudwatch = new AWS.CloudWatch({ credentials: roleCreds, region })

  /**
   * Prepare input range data
   * - Determine time unit (aka "period"), 1 minute, 1 hour, etc.
   * - Pre-fill the response values w/ timestamps, since CloudWatch does not return empty bucket values.
   */

  let period
  let timeUnit
  let timeBuckets
  const xData = []
  const yData = []
  const diffMinutes = Math.ceil(rangeEnd.diff(rangeStart, 'minutes', true)) // 'true' returns decimals

  // Length: 0 mins - 2 hours
  if (diffMinutes <= 120) {
    timeUnit = 'minute'
    period = 60
    rangeStart = rangeStart.startOf('minute')
    rangeEnd = rangeEnd.endOf('minute')
    timeBuckets = rangeEnd.diff(rangeStart, 'minutes')
    // Create values
    for (let i = 0; i <= timeBuckets; i++) {
      xData.push(rangeStart.clone().add(i, 'minutes').toISOString())
      yData.push(0)
    }
  }
  // Length: 2 hours - 48 hours
  else if (diffMinutes > 120 && diffMinutes <= 2880) {
    timeUnit = 'hour'
    period = 3600
    rangeStart = rangeStart.startOf('hour')
    rangeEnd = rangeEnd.endOf('hour')
    timeBuckets = rangeEnd.diff(rangeStart, 'hours')
    // Create values
    for (let i = 0; i <= timeBuckets; i++) {
      xData.push(rangeStart.clone().add(i, 'hours').toISOString())
      yData.push(0)
    }
  }
  // Length: 48 hours to 32 days
  else if (diffMinutes > 2880) {
    timeUnit = 'day'
    period = 86400
    rangeStart = rangeStart.startOf('day')
    rangeEnd = rangeEnd.endOf('day')
    timeBuckets = rangeEnd.diff(rangeStart, 'days')
    // Create values
    for (let i = 0; i <= timeBuckets; i++) {
      xData.push(rangeStart.clone().add(i, 'days').toISOString())
      yData.push(0)
    }
  }

  // Prepare CloudWatch queries
  const params = {
    StartTime: rangeStart.unix(),
    EndTime: rangeEnd.unix(),
    // NextToken: null, // No need for this since we are restricting value counts.
    ScanBy: 'TimestampAscending',
    MetricDataQueries: [
      {
        Id: 'metric_alias1',
        ReturnData: true,
        MetricStat: {
          Metric: {
            MetricName: 'Count',
            Namespace: 'AWS/ApiGateway',
            Dimensions: [
              {
                Name: 'Stage',
                Value: '$default'
              },
              {
                Name: 'ApiId',
                Value: apiId
              }
            ]
          },
          Period: period,
          Stat: 'Sum'
        }
      },
      {
        Id: 'metric_alias2',
        ReturnData: true,
        MetricStat: {
          Metric: {
            MetricName: '5xx',
            Namespace: 'AWS/ApiGateway',
            Dimensions: [
              {
                Name: 'Stage',
                Value: '$default'
              },
              {
                Name: 'ApiId',
                Value: apiId
              }
            ]
          },
          Period: period,
          Stat: 'Sum'
        }
      },
      {
        Id: 'metric_alias3',
        ReturnData: true,
        MetricStat: {
          Metric: {
            MetricName: '4xx',
            Namespace: 'AWS/ApiGateway',
            Dimensions: [
              {
                Name: 'Stage',
                Value: '$default'
              },
              {
                Name: 'ApiId',
                Value: apiId
              }
            ]
          },
          Period: period,
          Stat: 'Sum'
        }
      },
      {
        Id: 'metric_alias4',
        ReturnData: true,
        MetricStat: {
          Metric: {
            MetricName: 'Latency',
            Namespace: 'AWS/ApiGateway',
            Dimensions: [
              {
                Name: 'Stage',
                Value: '$default'
              },
              {
                Name: 'ApiId',
                Value: apiId
              }
            ]
          },
          Period: period,
          Stat: 'Average'
        }
      }
    ]
  }

  const data = await cloudwatch.getMetricData(params).promise()

  /**
   * Prepare response data
   */

  const result = {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    metrics: []
  }

  // Format Results into standard format
  if (data && data.MetricDataResults) {
    data.MetricDataResults.forEach((cwMetric) => {

      // Create metric
      const metric = {}
      metric.type = 'bar-v1'
      metric.stat = null
      metric.statText = null
      metric.statColor = '#000000'
      metric.xData = xData.slice()
      metric.yDataSets = [{}]
      metric.yDataSets[0].yData = yData.slice()

      // Add Values
      cwMetric.Timestamps.forEach((cwVal, i) => {
        metric.xData.forEach((xVal, i2) => {
          if (moment(xVal).isSame(cwVal)) {
            metric.yDataSets[0].yData[i2] = cwMetric.Values[i]
          }
        })
      })

      // Customize the metric depending on its type
      if (cwMetric.Label === 'Count') {
        metric.title = 'Requests'
        metric.yDataSets[0].color = '#000000'
        // Get Sum
        metric.stat = metric.yDataSets[0].yData.reduce((previous, current) => current += previous)
      }
      if (cwMetric.Label === '5xx') {
        metric.title = 'Errors - 5xx'
        metric.statColor = '#FE5850'
        metric.yDataSets[0].color = '#FE5850'

        // Get Sum
        metric.stat = metric.yDataSets[0].yData.reduce((previous, current) => current += previous)
      }
      if (cwMetric.Label === '4xx') {
        metric.title = 'Errors - 4xx'
        metric.statColor = '#FE5850'
        metric.yDataSets[0].color = '#FE5850'
        // Get Sum
        metric.stat = metric.yDataSets[0].yData.reduce((previous, current) => current += previous)
      }
      if (cwMetric.Label === 'Latency') {
        metric.title = 'Latency'
        metric.statColor = '#029CE3'
        metric.yDataSets[0].color = '#029CE3'
        // Round Decimals
        metric.yDataSets[0].yData = metric.yDataSets[0].yData.map((val) => Math.ceil(val))
        // Get Sum
        metric.stat = metric.yDataSets[0].yData.reduce((previous, current) => current += previous)
        // Get Average
        const filtered = metric.yDataSets[0].yData.filter(x => x > 0)
        metric.stat = Math.ceil(metric.stat / filtered.length)
        metric.statText = 'ms'
      }

      // Add metric
      result.metrics.push(metric)
    })
  }

  return result
}

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
      Name: inputs.alias
    }

    const getAliasRes = await clients.lambda.getAlias(getAliasParams).promise()
    return getAliasRes.AliasArn
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      return null
    }
    throw e
  }
}

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
      Name: 'default'
    }

    const getAliasRes = await clients.lambda.getAlias(getAliasParams).promise()
    return getAliasRes.FunctionVersion
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      throw new Error('The specified traffic destination does not exist')
    }
    throw e
  }
}

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
    return null
  }

  const additionalVersion = await getAliasFunctionVersion(instance, inputs, clients)

  const routingConfig = {
    AdditionalVersionWeights: {}
  }

  // if the user specified 0.2 traffic for this feature codebase/deployment
  // that means redirect 0.8 to the default alias
  routingConfig.AdditionalVersionWeights[additionalVersion] = 1 - inputs.traffic

  return routingConfig
}

/*
 * Creates or updates default or feature alias
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateAlias = async (instance, inputs, clients) => {
  inputs.alias = 'default'

  if (inputs.traffic && Number(instance.state.lambdaVersion) > 1) {
    inputs.alias = 'feature'
  }

  console.log(`Verifying alias "${inputs.alias}"...`)
  instance.state.aliasArn = await getAlias(instance, inputs, clients)

  const aliasParams = {
    FunctionName: instance.state.lambdaName,
    Name: inputs.alias,
    FunctionVersion: instance.state.lambdaVersion
  }

  const userDefinedRoutingConfig = await getRoutingConfig(instance, inputs, clients)

  if (userDefinedRoutingConfig) {
    aliasParams.RoutingConfig = userDefinedRoutingConfig
    console.log(
      `Shifting ${String(inputs.traffic * 100)}% of the traffic to the "${inputs.alias}" alias...`
    )
  }

  if (instance.state.aliasArn) {
    console.log(`Alias "${inputs.alias}" found. Updating...`)
    instance.state.aliasArn = (await clients.lambda.updateAlias(aliasParams).promise()).AliasArn
    console.log(`Alias "${inputs.alias}" updated.`)
  } else {
    console.log(`Alias "${inputs.alias}" not found. Creating...`)
    instance.state.aliasArn = (await clients.lambda.createAlias(aliasParams).promise()).AliasArn
    console.log(`Alias "${inputs.alias}" created.`)
  }

  return instance.state.aliasArn
}

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
  getMetrics
}
