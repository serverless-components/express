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
 * Logs a message
 *
 * @param ${string} msg - message to log
 */
const log = async (msg) => console.log(msg) // eslint-disable-line

/*
 * Generates a random id
 */
const generateId = () =>
  Math.random()
    .toString(36)
    .substring(6)

const getDefaultDescription = (instance) => {
  return `Serverless Express App for ${instance.org} - ${instance.stage} - ${instance.app}`
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
  // unzip source zip file
  const sourceDirectory = await instance.unzip(inputs.src)

  // add shim to the source directory
  copySync(path.join(__dirname, '_express'), path.join(sourceDirectory, '_express'))

  // add sdk to the source directory, add original handler
  instance.state.handler = await instance.addSDK(sourceDirectory, '_express/handler.handler')

  // zip the source directory with the shim and the sdk
  const zipPath = await instance.zip(sourceDirectory)

  // save the zip path to state for lambda to use it
  instance.state.zipPath = zipPath

  return zipPath
}

/*
 * Fetches the role from AWS to validate its existance
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getRole = async (instance, inputs, clients) => {
  let RoleName = instance.state.name

  // if user provided a custom role arn, validate that instead
  if (inputs.roleArn) {
    RoleName = inputs.roleArn
  }

  try {
    const res = await clients.iam.getRole({ RoleName }).promise()
    instance.state.roleArn = res.Role.Arn
    return res.Role.Arn
  } catch (e) {
    if (e.message.includes('cannot be found')) {
      return null
    }
    throw e
  }
}

/*
 * Creates a role on aws if no roleArn found in state
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const ensureRole = async (instance, inputs, clients) => {
  if (instance.state.roleArn) {
    return
  }

  log(`Creating role ${instance.state.name}`)

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
  const res = await clients.iam
    .createRole({
      RoleName: instance.state.name,
      Path: '/',
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument)
    })
    .promise()

  await clients.iam
    .attachRolePolicy({
      RoleName: instance.state.name,
      PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess'
    })
    .promise()

  instance.state.roleArn = res.Role.Arn

  log(`Role created with ARN ${res.Role.Arn}`)

  return res.Role.Arn
}

/*
 * Removes a role from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeRole = async (instance, clients) => {
  if (!instance.state.roleArn) {
    return
  }
  const roleName = instance.state.roleArn
    .split(':')
    [instance.state.roleArn.split(':').length - 1].replace('role/', '')

  try {
    await clients.iam
      .detachRolePolicy({
        RoleName: instance.state.name,
        PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess'
      })
      .promise()
    await clients.iam
      .deleteRole({
        RoleName: instance.state.name
      })
      .promise()
  } catch (error) {
    if (error.code !== 'NoSuchEntity') {
      throw error
    }
  }
}

/*
 * Fetches a lambda function from aws
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getLambda = async (instance, inputs, clients) => {
  try {
    const res = await clients.lambda
      .getFunctionConfiguration({
        FunctionName: instance.state.name
      })
      .promise()

    instance.state.lambdaArn = res.FunctionArn

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
    FunctionName: instance.state.name,
    Code: {},
    Description: inputs.description || getDefaultDescription(instance),
    Handler: instance.state.handler,
    MemorySize: inputs.memory || 3008,
    Publish: false,
    Role: instance.state.roleArn,
    Runtime: 'nodejs12.x',
    Timeout: inputs.timeout || 29,
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

    instance.state.lambdaArn = res.FunctionArn

    log(`Lambda created with ARN ${res.FunctionArn}`)
    return res.FunctionArn
  } catch (e) {
    if (e.message.includes(`The role defined for the function cannot be assumed by Lambda`)) {
      // we need to wait around 9 seconds after the role is craated before it can be assumed
      await sleep(1000)
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
  log(`Updating lambda code from ${inputs.src}`)

  const functionCodeParams = {
    FunctionName: instance.state.name,
    Publish: false
  }

  functionCodeParams.ZipFile = await readFile(instance.state.zipPath)

  const res = await clients.lambda.updateFunctionCode(functionCodeParams).promise()

  instance.state.lambdaArn = res.FunctionArn

  log(`Lambda code updated from ${inputs.src}`)

  return res.FunctionArn
}

/*
 * Updates lambda code on aws according to the provided config
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const updateLambdaConfig = async (instance, inputs, clients) => {
  log(`Updating lambda config`)

  const functionConfigParams = {
    FunctionName: instance.state.name,
    Description: inputs.description || getDefaultDescription(instance),
    MemorySize: inputs.memory || 3008,
    Role: instance.state.roleArn,
    Timeout: inputs.timeout || 900,
    Environment: {
      Variables: inputs.env || {}
    }
  }

  if (inputs.layers) {
    functionConfigParams.Layers = inputs.layers
  }

  const res = await clients.lambda.updateFunctionConfiguration(functionConfigParams).promise()

  instance.state.lambdaArn = res.FunctionArn

  log(`Lambda config updated`)

  return res.FunctionArn
}

/*
 * Removes a lambda function from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeLambda = async (instance, clients) => {
  if (!instance.state.lambdaArn) {
    return
  }

  log(`Removing lambda with arn ${instance.state.lambdaArn}`)

  try {
    const params = { FunctionName: instance.state.lambdaArn }
    await clients.lambda.deleteFunction(params).promise()
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') {
      throw error
    }
  }
}

/*
 * Fetches an Api from AWS according to the provided config to validate its existance
 *
 * @param ${instance} instance - the component instance
 * @param ${object} inputs - the component inputs
 * @param ${object} clients - the aws clients object
 */
const getApi = async (instance, inputs, clients) => {
  // if id does not exist in state, move on
  if (!instance.state.apiId) {
    return
  }

  // validate that the apiId still exists in the provider
  try {
    await clients.apig.getApi({ ApiId: instance.state.apiId }).promise()
    return instance.state.apiId
  } catch (e) {
    if (e.code === 'NotFound') {
      // todo test this error code
      instance.state.apiId = null
      return null
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
const ensureApi = async (instance, inputs, clients) => {
  // if API alredy exists, just move on
  if (instance.state.apiId) {
    return
  }

  log(`Creating Api ${instance.state.name}`)
  const region = inputs.region || 'us-east-1'
  const createApiParams = {
    Name: instance.state.name,
    ProtocolType: 'HTTP',
    CredentialsArn: instance.state.roleArn,
    Description: inputs.description || getDefaultDescription(instance),
    Target: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${instance.state.lambdaArn}/invocations`,
    CorsConfiguration: {
      AllowHeaders: ['*'],
      AllowOrigins: ['*']
    }
  }

  const res = await clients.apig.createApi(createApiParams).promise()

  instance.state.apiId = res.ApiId

  log(`Api ${instance.state.name} created with ID ${res.ApiId}`)

  return res.ApiId
}

/*
 * Removes an API from aws according to the provided config
 *
 * @param ${object} clients - an object containing aws sdk clients
 * @param ${object} config - the component config
 */
const removeApi = async (instance, clients) => {
  if (!instance.state.apiid) {
    return
  }

  log(`Removing API with ID ${instance.state.apiId}`)

  try {
    await clients.apig.deleteApi({ ApiId: instance.state.apiId })
  } catch (e) {}
}

const getDomainHostedZoneId = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)

  log(`Getting hosted zone id for domain ${nakedDomain}`)

  const hostedZonesRes = await clients.route53.listHostedZonesByName().promise()

  const hostedZone = hostedZonesRes.HostedZones.find(
    // Name has a period at the end, so we're using includes rather than equals
    (zone) => zone.Name.includes(nakedDomain)
  )

  if (!hostedZone) {
    throw Error(
      `Domain ${nakedDomain} was not found in your AWS account. Please purchase it from Route53 first then try again.`
    )
  }

  instance.state.domainHostedZoneId = hostedZone.Id.replace('/hostedzone/', '') // hosted zone id is always prefixed with this :(

  log(`Domain hosted zone id for ${nakedDomain} is ${instance.state.domainHostedZoneId}`)

  return instance.state.domainHostedZoneId
}

const getCertificateArnByDomain = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)

  log(`Checking if a certificate for the ${nakedDomain} domain exists`)

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

const getCertificateValidationRecord = (certificate, domain) => {
  const domainValidationOption = certificate.DomainValidationOptions.filter(
    (option) => option.DomainName === domain
  )

  return domainValidationOption.ResourceRecord
}

const ensureCertificate = async (instance, inputs, clients) => {
  const nakedDomain = getNakedDomain(inputs.domain)
  const wildcardSubDomain = `*.${nakedDomain}`

  const params = {
    DomainName: nakedDomain,
    SubjectAlternativeNames: [nakedDomain, wildcardSubDomain],
    ValidationMethod: 'DNS'
  }

  let certificateArn = await getCertificateArnByDomain(instance, inputs, clients)

  if (!certificateArn) {
    log(`Certificate for the ${nakedDomain} domain does not exist. Creating...`)
    certificateArn = (await clients.acm.requestCertificate(params).promise()).CertificateArn
  }

  const certificate = await describeCertificateByArn(clients, certificateArn)

  if (certificate.Status !== 'ISSUED') {
    log(`Validating the certificate for the ${nakedDomain} domain.`)

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

  instance.state.certificateArn = certificateArn

  return certificateArn
}

const createDomainInApig = async (instance, inputs, clients) => {
  log(`Domain ${inputs.domain} not found in API Gateway. Creating...`)

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
    const res = await clients.apig.createDomainName(params).promise()
    return res
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      await sleep(2000)
      return createDomainInApig(instance, inputs, clients)
    }
    throw e
  }
}

const configureDnsForApigDomain = async (instance, inputs, clients) => {
  log(`Configuring DNS for API Gateway domain ${inputs.domain}.`)

  const dnsRecord = {
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

  return clients.route53.changeResourceRecordSets(dnsRecord).promise()
}

/**
 * Map API Gateway API to the created API Gateway Domain
 */
const mapDomainToApi = async (instance, inputs, clients) => {
  log(`Mapping domain ${inputs.domain} to API ID ${instance.state.apiId}`)
  try {
    const params = {
      DomainName: inputs.domain,
      ApiId: instance.state.apiId,
      // basePath: '(none)',
      Stage: '$default'
    }
    // todo what if it already exists but for a different apiId
    return clients.apig.createApiMapping(params).promise()
  } catch (e) {
    if (e.code === 'TooManyRequestsException') {
      await sleep(2000)
      return mapDomainToApi(instance, inputs, clients)
    }
    throw e
  }
}

const createDomain = async (instance, inputs, clients) => {
  if (!instance.state.domainHostedZoneId) {
    await getDomainHostedZoneId(instance, inputs, clients)
  }

  if (!instance.state.certificateArn) {
    await ensureCertificate(instance, inputs, clients)
  }

  try {
    await mapDomainToApi(instance, inputs, clients)
    instance.state.domain = inputs.domain
  } catch (e) {
    if (e.message === 'Invalid domain name identifier specified') {
      const res = await createDomainInApig(instance, inputs, clients)

      instance.state.distributionHostedZoneId = res.distributionHostedZoneId
      instance.state.distributionDomainName = res.distributionDomainName

      await configureDnsForApigDomain(instance, inputs, clients)

      // retry domain deployment now that domain is created
      return createDomain(instance, inputs, clients)
    }

    if (e.message === 'Base path already exists for this domain name') {
      log(`Domain ${inputs.domain} is already mapped to API ID ${instance.state.apiId}.`)
      return
    }
    throw new Error(e)
  }
}

/**
 * Remove API Gateway Domain
 */

const removeDomainFromApig = async (instance, clients) => {
  log(`Removing domain ${instance.state.domainn} from API Gateway`)
  const params = {
    DomainName: instance.state.domain
  }

  return clients.apig.deleteDomainName(params).promise()
}

/**
 * Remove API Gateway Domain DNS Records
 */

const removeDnsRecordsForApigDomain = async (instance, clients) => {
  log(`Removing DNS records for domain ${instance.state.domain}`)
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

  return clients.route53.changeResourceRecordSets(dnsRecord).promise()
}

const removeDomain = async (instance, clients) => {
  await Promise.all([
    removeDomainFromApig(instance, clients),
    removeDnsRecordsForApigDomain(instance, clients)
  ])
}

module.exports = {
  log,
  generateId,
  sleep,
  getClients,
  getRole,
  ensureRole,
  getLambda,
  getApi,
  ensureApi,
  removeApi,
  createLambda,
  updateLambdaCode,
  updateLambdaConfig,
  packageExpress,
  removeRole,
  removeLambda,
  ensureCertificate,
  getDomainHostedZoneId,
  createDomain,
  removeDomain
}
