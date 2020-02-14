const path = require('path')
const AWS = require('aws-sdk')
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
  return 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
}

/*
 * Initializes an AWS SDK and returns the relavent service clients
 *
 * @param ${object} credentials - aws credentials object
 * @param ${string} region - aws region
 */
const getClients = (credentials, region = 'us-east-1') => {
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
const packageExpress = async (instance, inputs) => {

  console.log(`Packaging Express.js application...`)

  // unzip source zip file
  console.log(`Unzipping ${inputs.src}...`)
  const sourceDirectory = await instance.unzip(inputs.src)
  console.log(`Files unzipped into ${sourceDirectory}...`)

  // add shim to the source directory
  console.log(`Installing Express + AWS Lambda handler...`)
  copySync(path.join(__dirname, '_express'), path.join(sourceDirectory, '_express'))

  // add sdk to the source directory, add original handler
  console.log(`Installing Serverless Framework SDK...`)
  instance.state.handler = await instance.addSDK(sourceDirectory, '_express/handler.handler')

  // zip the source directory with the shim and the sdk
  console.log(`Zipping files...`)
  const zipPath = await instance.zip(sourceDirectory)
  console.log(`Files zipped into ${zipPath}...`)

  // save the zip path to state for lambda to use it
  instance.state.zipPath = zipPath

  return zipPath
}

/*
 * Fetches the role from AWS to validate its existance
 */
const getRole = async (clients, roleArn) => {
  try {
    const res = await clients.iam.getRole({ RoleName: roleArn }).promise()
    return res.Role.Arn
  } catch (e) {
    if (e.message.includes('cannot be found')) return null
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
    if (e.code === 'ResourceNotFoundException') return null
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
    Publish: false,
    Role: inputs.roleArn || instance.state.defaultLambdaRoleArn, // Default to automatically created role
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

  let lambdaArn
  try {
    const res = await clients.lambda.createFunction(params).promise()
    console.log(`Lambda created with ARN ${res.FunctionArn}`)
    lambdaArn = res.FunctionArn
  } catch (e) {
    if (e.message.includes(`The role defined for the function cannot be assumed by Lambda`) ||
        e.message.includes(`Lambda was unable to configure access to your environment variables because the KMS key is invalid`)) {
      // we need to wait around 2 seconds after the role is created before it can be assumed
      await sleep(2000)
      return createLambda(instance, inputs, clients)
    }
    throw e
  }

  return lambdaArn
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
    Publish: false
  }
  functionCodeParams.ZipFile = await readFile(instance.state.zipPath)
  await clients.lambda.updateFunctionCode(functionCodeParams).promise()
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
    Role: inputs.roleArn || instance.state.defaultLambdaRoleArn, // Default to auto-create role
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

  const res = await clients.lambda.updateFunctionConfiguration(functionConfigParams).promise()
  return res.FunctionArn
}

/**
 * Get the Hosted Zone ID of the custom domain in Route 53
 */
const getDomainHostedZoneId = async (instance, inputs, clients) => {
  
  const nakedDomain = getNakedDomain(inputs.domain)

  console.log(`Getting Route53 Hosted Zone ID for domain: ${nakedDomain}`)

  const hostedZones = await clients.route53.listHostedZonesByName().promise()

  let hostedZone = hostedZones.HostedZones.find(
    // Name has a period at the end, so we're using includes rather than equals
    (zone) => zone.Name.includes(nakedDomain)
  )

  if (!hostedZone) {
    throw Error(
      `Domain ${nakedDomain} was not found in your AWS account. Please purchase it from Route53 first then try again.`
    )
  }

  hostedZone = hostedZone.Id.replace('/hostedzone/', '') // hosted zone id is always prefixed with this :(

  console.log(`Domain hosted zone id for ${nakedDomain} is ${hostedZone}`)

  return hostedZone
}

/**
 * Get an AWS ACM Certificate by a domain name 
 * @param {*} instance 
 * @param {*} inputs 
 * @param {*} clients 
 */
const getCertificateArnByDomain = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)

  console.log(`Checking if a certificate for the ${nakedDomain} domain exists`)
  const listRes = await clients.acm.listCertificates().promise()
  const certificate = listRes.CertificateSummaryList.find((cert) => cert.DomainName === nakedDomain)

  return certificate && certificate.CertificateArn ? certificate.CertificateArn : null
}

const describeCertificateByArn = async (clients, certificateArn) => {
  const certificate = await clients.acm
    .describeCertificate({ CertificateArn: certificateArn })
    .promise()
  return certificate && certificate.Certificate ? certificate.Certificate : null
}

/**
 * Gets the Resource Record needed on the Certificate Record to validate it via the DNS Validation Method
 * @param {*} certificate 
 * @param {*} domain 
 */
const getCertificateValidationRecord = (certificate, domain) => {
  const domainValidationOption = certificate.DomainValidationOptions.filter(
    (option) => option.DomainName === domain
  )

  if (Array.isArray(domainValidationOption)) {
    return domainValidationOption[0].ResourceRecord
  }
  return domainValidationOption.ResourceRecord
}

/**
 * Find or create AWS ACM Certificate
 */
const findOrCreateCertificate = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)
  const wildcardSubDomain = `*.${nakedDomain}`

  const params = {
    DomainName: nakedDomain,
    SubjectAlternativeNames: [nakedDomain, wildcardSubDomain],
    ValidationMethod: 'DNS'
  }

  let certificateArn = await getCertificateArnByDomain(instance, inputs, clients)

  if (!certificateArn) {
    console.log(`Certificate for the ${nakedDomain} domain does not exist. Creating one...`)
    certificateArn = (await clients.acm.requestCertificate(params).promise()).CertificateArn
  } else {
    console.log(`Found certificate with the ARN ${certificateArn}`)
  }

  const certificate = await describeCertificateByArn(clients, certificateArn)

  if (certificate.Status !== 'ISSUED') {
    console.log(`AWS ACM Certificate is not yet valid for the domain: ${nakedDomain}.  Validating it via the DNS method...`)

    const certificateValidationRecord = getCertificateValidationRecord(certificate, nakedDomain)

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
          EndpointType: 'EDGE',
          SecurityPolicy: 'TLS_1_2',
          CertificateArn: instance.state.certificateArn
        }
      ]
    }
    res = await clients.apig.createDomainName(params).promise()
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log(`API Gateway is throttling our API Requests *sigh*.  Sleeping for 2 seconds...`)
      await sleep(2000)
      return createDomainInApig(instance, inputs, clients)
    }
    throw e
  }

  console.log(`Domain ${inputs.domain} successfully created.`)
  return res
}

/**
 * Ensure a Route 53 Hosted Zone AliasTarget Record Set for the HTTP Custom Domain
 * @param {*} instance 
 * @param {*} inputs 
 * @param {*} clients 
 */
const ensureRecordSetForApiGCustomDomain = async (instance, inputs, clients) => {

  console.log(`Ensuring the existence of a Route 53 Hosted Zone AliasTarget Record Set for HTTP API with a Hosted Zone ID: ${instance.state.distributionHostedZoneId} and DNS Name: ${instance.state.distributionDomainName}.`)

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
              HostedZoneId: instance.state.distributionHostedZoneId,
              DNSName: instance.state.distributionDomainName,
              EvaluateTargetHealth: false
            }
          }
        }
      ]
    }
  }

  try {
    await clients.route53.changeResourceRecordSets(changeParams).promise()
  } catch(error) { console.error(error) }
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
    result.distributionHostedZoneId = domain.DomainNameConfigurations[0].HostedZoneId
    result.distributionDomainName = domain.DomainNameConfigurations[0].ApiGatewayDomainName
    return result
  } catch(error) {
    if (error.code === 'NotFoundException') {
      console.log(`Custom Domain not found oni API Gateway: ${inputs.domain}.  Creating it...`)
      const res = await createDomainInApig(instance, inputs, clients)
      result.distributionHostedZoneId = res.DomainNameConfigurations[0].HostedZoneId
      result.distributionDomainName = res.DomainNameConfigurations[0].ApiGatewayDomainName
      console.log(`Domain ${instance.state.domain} successfully created.  If this is your first deploy, please note that you will have to wait typical DNS propagation times for your domain name to be accessible.  This is often only 10-20 minutes, but on occassion can take ~4 hours.`)
      return result
    }
    throw error
  }
}

/**
 * Ensure API Gateway API is mapped to the custom API Gateway Domain
 */
const findOrCreateApiMapping = async (instance, inputs, clients) => {

  const result = {}

  console.log(`Verifying API Gateway Custom Domain: ${inputs.domain} is mapped to API ID: ${instance.state.apiId}`)
  
  let apiMapping
  const paramsGet = {
    DomainName: instance.state.domain,
  }
  const apiMappings = await clients.apig.getApiMappings(paramsGet).promise()
  apiMappings.Items.forEach((am) => {
    if (am.ApiId === instance.state.apiId) apiMapping = am
  })

  if (apiMapping) {
    console.log(`API Mapping found with API Mapping ID: ${apiMapping.ApiMappingId}`)
    return apiMapping.ApiMappingId
  }

  try {
    console.log(`API Mapping to API Custom Domain not found.  Creating one...`)
    const createApiMappingParams = {
      DomainName: inputs.domain,
      ApiId: instance.state.apiId,
      Stage: '$default'
    }
    const resMapping = await clients.apig.createApiMapping(createApiMappingParams).promise()
    console.log(`API Mapping successfully created with ID: ${result.apiMappingId}`)
    return resMapping.ApiMappingId
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      console.log(`AWS API Gateway is throttling our API requests.  Sleeping for 2 seconds...`)
      await sleep(2000)
      return findOrCreateApiMapping(instance, inputs, clients)
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
const createOrUpdateRole = async (instance, inputs, clients) => {

  // Verify existing role, either provided or the previously created default role...
  if (inputs.roleArn) {
    console.log(`User has provided their own IAM Role with the ARN: ${inputs.roleArn}.  Skipping verification and automatic role creation, and using that...`)
  }
  
  if (!inputs.roleArn && instance.state.defaultLambdaRoleArn) {
    console.log(`Verifying the default IAM Role found in state exists with the name: ${instance.state.defaultLambdaRoleName}...`)
    instance.state.defaultLambdaRoleArn = await getRole(clients, instance.state.defaultLambdaRoleName)
  }

  // Create a default lambda role...
  if (!inputs.roleArn && !instance.state.defaultLambdaRoleArn) {
    instance.state.defaultLambdaRoleName = `${instance.state.name}-lambda-role`
    console.log(`IAM Role not found.  Creating a default role with the name: ${instance.state.defaultLambdaRoleName}`)

    const assumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: {
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com', 'apigateway.amazonaws.com']
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
 * Ensures the AWS Lambda function exists
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const createOrUpdateLambda = async (instance, inputs, clients) => {

  // Verify existing lambda
  if (instance.state.lambdaArn && instance.state.lambdaName) {
    console.log(`Verifying the AWS Lambda with the ARN: ${instance.state.lambdaArn} and Name: ${instance.state.lambdaName} found in state exists...`)
    instance.state.lambdaArn = await getLambda(clients, instance.state.lambdaName)
  }

  if (!instance.state.lambdaArn) {
    instance.state.lambdaName = `${instance.state.name}-function` // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY NEW FUNCTIONS, RATHER THAN UPDATE THEIR OLD ONES.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
    console.log(`No AWS Lambda function found.  Creating one with the name: ${instance.state.lambdaName}`)
    instance.state.lambdaArn = await createLambda(instance, inputs, clients)
    return
  }

  console.log(`AWS Lambda function found.  Updating it's configuration and code...`)
  await updateLambdaCode(instance, inputs, clients)
  await updateLambdaConfig(instance, inputs, clients)
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
    } catch(error) {
      if (error.code !== 'NotFoundException') { throw error }
    }
  }

  if (apiId) {
    console.log(`API found with ID: ${instance.state.apiId}`)
    return
  }

  instance.state.apiName = `${instance.name}-api` // WARNING: DO NOT ADJUST THIS, OR EVERYONE WILL DEPLOY A NEW API, RATHER THAN UPDATE THEIR OLD ONE.  ADJUST THIS ONLY WHEN WE'RE READY TO DO A BREAKING CHANGE.
  console.log(`API not found. Creating API with name: ${instance.state.apiName}...`)
  const createApiParams = {
    Name: instance.state.apiName,
    ProtocolType: 'HTTP',
    // CredentialsArn: inputs.roleArn || instance.state.defaultLambdaRoleArn,
    Description: inputs.description || getDefaultDescription(instance),
    Target: `arn:aws:apigateway:${instance.state.region}:lambda:path/2015-03-31/functions/${instance.state.lambdaArn}/invocations`,
    CorsConfiguration: {
      AllowHeaders: ['*'],
      AllowOrigins: ['*']
    }
  }

  const res = await clients.apig.createApi(createApiParams).promise()
  instance.state.apiId = res.ApiId

  console.log(`API ${instance.state.apiName} created with ID ${instance.state.apiId}`)

  instance.state.url = `https://${instance.state.apiId}.execute-api.${instance.state.region}.amazonaws.com`

  // Give newly created API permission to call Lambda
  const apigArn = `arn:aws:execute-api:${instance.state.region}:${instance.state.awsAccountId}:${instance.state.apiId}/*/*`
  console.log(`Add permission to Lambda enabling API Gateway with this ARN to call it: ${apigArn}`)
  var paramsPermission = {
    Action: 'lambda:InvokeFunction', 
    FunctionName: instance.state.lambdaName, 
    Principal: 'apigateway.amazonaws.com',
    SourceArn: apigArn,
    StatementId: 'ID-1'
  }
  await clients.lambda.addPermission(paramsPermission).promise()
  console.log(`Permission successfully added to AWS Lambda for API Gateway`)
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

  instance.state.certificateArn = await findOrCreateCertificate(instance, inputs, clients)

  const domain = await findOrCreateCustomDomain(instance, inputs, clients)
  instance.state.distributionHostedZoneId = domain.distributionHostedZoneId
  instance.state.distributionDomainName = domain.distributionDomainName

  const mappingId = await findOrCreateApiMapping(instance, inputs, clients)
  instance.state.apiMappingId = mappingId

  await ensureRecordSetForApiGCustomDomain(instance, inputs, clients)
}


/**
 * 
 * 
 * Removal Logic
 * 
 * 
 */



/*
 * Removes a role from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeRole = async (instance, clients) => {

  // If an automiatcally created IAM Role ARN is not in state, do not proceed...
  if (!instance.state.defaultLambdaRoleArn) {
    return
  }

  try {
    await clients.iam
      .detachRolePolicy({
        RoleName: instance.state.defaultLambdaRoleName,
        PolicyArn: getDefaultLambdaRolePolicyArn(),
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

/*
 * Removes a lambda function from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeLambda = async (instance, clients) => {

  if (!instance.state.defaultLambdaRoleName) return

  console.log(`Removing lambda with arn ${instance.state.defaultLambdaRoleName}`)

  try {
    const params = { FunctionName: instance.state.defaultLambdaRoleName }
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

  if (!instance.state.apiMappingId) return

  console.log(`Removing API Mapping with ID ${instance.state.apiMappingId}`)

  const params = {
    ApiMappingId: instance.state.apiMappingId,
    DomainName: instance.state.domain,
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

  if (!instance.state.apiId) return

  console.log(`Removing API with ID ${instance.state.apiId}`)

  try {
    await clients.apig.deleteApi({ ApiId: instance.state.apiId }).promise()
  } catch (e) { console.log(e) }
}

/**
 * Remove API Gateway Domain
 */
const removeDomainFromApig = async (instance, clients) => {

  if (!instance.state.domain) return

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

  if (!instance.state.domain || !instance.state.domainHostedZoneId || !instance.state.distributionDomainName) {
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
              HostedZoneId: instance.state.distributionHostedZoneId,
              DNSName: instance.state.distributionDomainName,
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

module.exports = {
  generateId,
  sleep,
  getClients,
  packageExpress,
  createOrUpdateRole,
  createOrUpdateLambda,
  createOrUpdateApi,
  createOrUpdateDomain,
  removeApi,
  removeRole,
  removeLambda,
  removeDomain
}
