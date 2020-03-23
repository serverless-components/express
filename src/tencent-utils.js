const tencent = require('tencentcloud-sdk-nodejs')
const _ = require('lodash')

const {
  CreateApi,
  ModifyApi,
  CreateService,
  CreateUsagePlan,
  ModifyUsagePlan,
  CreateApiKey,
  BindSecretIds,
  BindEnvironment,
  ReleaseService,
  DescribeService,
  DeleteApi,
  UnBindSecretIds,
  UnBindEnvironment,
  DeleteUsagePlan,
  DeleteApiKey,
  UnReleaseService,
  DisableApiKey,
  Validate,
  DescribeUsagePlan,
  DescribeApiKeysStatus,
  DescribeUsagePlanSecretIds,
  DescribeApiUsagePlan,
  DeleteService,
  CheckExistsFromError,
  DescribeApi,
  DescribeApisStatus,
  ModifyService,
  BindSubDomain,
  UnBindSubDomain,
  DescribeServiceSubDomains
} = require('./tencent-apig-utils.js')

const getTencentSCFByName = async (client, functionName) => {
  return new Promise((resolve, reject) => {
    const req = new tencent.scf.v20180416.Models.GetFunctionRequest()
    req.FunctionName = functionName

    client.GetFunction(req, (err, res) => {
      if (err) {
        if (err.code === 'ResourceNotFound.FunctionName') {
          return resolve(null)
        }
        console.error(err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}

const createTencentSCF = async (client, params) => {
  return new Promise((resolve, reject) => {
    const functionCode = new tencent.scf.v20180416.Models.Code()
    functionCode.ZipFile = params.Code.ZipFile
    const req = new tencent.scf.v20180416.Models.CreateFunctionRequest()
    req.FunctionName = params.FunctionName
    req.Description = params.Description
    req.CodeSource = 'ZipFile'
    req.Code = functionCode
    req.Handler = params.Handler
    req.MemorySize = params.MemorySize
    req.Timeout = params.Timeout
    req.Environment = {
      Variables: Object.entries(params.Environment.Variables).map(([Key, Value]) => {
        return { Key, Value }
      })
    }
    req.Runtime = params.Runtime
    if (params.Layers) {
      req.Layers = params.Layers
    }
    // TODO support role for tencent
    // req.Role = functionConfig.role

    client.CreateFunction(req, (err, res) => {
      if (err) {
        console.error(err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}

const updateTencentSCFConf = async (client, params) => {
  return new Promise((resolve, reject) => {
    const req = new tencent.scf.v20180416.Models.UpdateFunctionConfigurationRequest()
    req.FunctionName = params.FunctionName
    req.Description = params.Description
    req.MemorySize = params.MemorySize
    req.Timeout = params.Timeout
    req.Environment = {
      Variables: Object.entries(params.Environment.Variables).map(([Key, Value]) => {
        return { Key, Value }
      })
    }
    req.Runtime = params.Runtime
    if (params.Layers) {
      req.Layers = params.Layers
    }
    // TODO support role for tencent
    // req.Role = functionConfig.role

    client.UpdateFunctionConfiguration(req, (err, res) => {
      if (err) {
        console.error(err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}

const updateTencentSCFCode = async (client, params) => {
  return new Promise((resolve, reject) => {
    const req = new tencent.scf.v20180416.Models.UpdateFunctionCodeRequest()
    req.Handler = params.Handler
    req.FunctionName = params.FunctionName
    req.Publish = params.Publish ? 'TRUE' : 'FALSE'
    req.CodeSource = 'ZipFile'
    req.ZipFile = params.ZipFile

    client.UpdateFunctionCode(req, (err, res) => {
      if (err) {
        console.error(err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}

const deleteTencentSCF = async (client, params) => {
  return new Promise((resolve, reject) => {
    const req = new tencent.scf.v20180416.Models.DeleteFunctionRequest()
    req.FunctionName = params.FunctionName

    client.DeleteFunction(req, (err, res) => {
      if (err) {
        console.error(err)
        return reject(err)
      }
      return resolve(res)
    })
  })
}

const createOrUpdateApi = async (apig, instance, inputs) => {
  console.log('Deploying API', instance)

  const serviceType = 'SCF'
  const serviceTimeout = 15
  const bindType = 'API'

  inputs.apiName = instance.name //instance.instanceId.split('.').slice(-1)[0]
  inputs.serviceName = inputs.serviceName ? inputs.serviceName : 'serverless'
  const params = Validate(inputs)
  let { serviceId } = params
  const { region, description, serviceName, apiName, protocols, environment, endpoints } = params
  const protocol = 'http&https'

  console.log(`Starting API-Gateway deployment with name ${apiName} in the ${region} region`)

  const serviceInputs = {
    Region: region,
    serviceDesc: description,
    // Up to 50 characters，(a-z,A-Z,0-9,_)
    serviceName: serviceName,
    protocol
  }
  if (region == 'ap-beijing') {
    serviceInputs.exclusiveSetName = 'APIGW_FOR_SCF_SET1'
  }

  let subDomain = ''
  let serviceCreated = true

  if (serviceId) {
    const serviceMsg = await DescribeService({
      apig,
      Region: region,
      serviceId
    })
    serviceCreated = false
    subDomain = serviceMsg.subDomain
  } else {
    if (instance.state && instance.state.service && instance.state.service.value) {
      serviceId = instance.state.service.value
      console.log(`Using last time deploy service id ${serviceId}`)
      try {
        const serviceMsg = await DescribeService({ apig, Region: region, serviceId })
        // serviceCreated = false
        subDomain = serviceMsg.subDomain
      } catch (e) {
        if (!CheckExistsFromError(e)) {
          console.log(`Service ID ${serviceId} not found. Creating a new Service.`)
          serviceId = null
        } else {
          throw e
        }
      }
    }
  }

  if (!serviceId) {
    const serviceMsg = await CreateService({ apig, ...serviceInputs })
    serviceCreated = true
    console.log(`Service with ID ${serviceMsg.serviceId} created.`)
    serviceId = serviceMsg.serviceId
    subDomain = serviceMsg.subDomain
  } else {
    console.log(`Updating service with serviceId ${serviceId}.`)
    await ModifyService({ apig, serviceId, ...serviceInputs })
  }

  const state = {
    protocols,
    subDomain: subDomain,
    environment: environment,
    region: region,
    service: {
      value: serviceId,
      created: serviceCreated
    }
  }

  const apiAuthSetting = async (ctx, region, apiClient, endpoint) => {
    let usagePlan = endpoint.usagePlan
    if (usagePlan == null) {
      usagePlan = {}
    }

    const usageInputs = {
      Region: region,
      usagePlanName: usagePlan.usagePlanName || '',
      usagePlanDesc: usagePlan.usagePlanDesc || '',
      maxRequestNumPreSec: usagePlan.maxRequestNumPreSec,
      maxRequestNum: usagePlan.maxRequestNum
    }

    const usagePlanId = {
      created: false,
      value: usagePlan.usagePlanId
    }

    if (!usagePlan.usagePlanId) {
      if (instance.state && instance.state.apis && _.isArray(instance.state.apis)) {
        const oldApi = _.find(instance.state.apis, (api) => {
          if (
            api.method.toLowerCase() == endpoint.method.toLowerCase() &&
            api.path == endpoint.path
          ) {
            return api
          }
        })
        if (!_.isEmpty(oldApi)) {
          console.log(`Using last time deploy usage plan id ${oldApi.usagePlanId.value}.`)
          usagePlan.usagePlanId = oldApi.usagePlanId.value
          usagePlanId.created = oldApi.usagePlanId.created
          usagePlanId.value = oldApi.usagePlanId.value
        }
      }
    }

    if (!usagePlan.usagePlanId) {
      usagePlanId.value = await CreateUsagePlan({ apig: apiClient, ...usageInputs })
      usagePlanId.created = true
      ctx.context.debug(`Usage plan with ID ${usagePlanId.value} created.`)
    } else {
      await DescribeUsagePlan({
        apig: apiClient,
        usagePlanId: usagePlan.usagePlanId,
        Region: region
      })
      ctx.context.debug(`Updating usage plan with id ${usagePlan.usagePlanId}.`)
      await ModifyUsagePlan({
        apig: apiClient,
        usagePlanId: usagePlan.usagePlanId,
        ...usageInputs
      })
    }

    const secretIds = {
      created: false,
      value: endpoint.auth.secretIds
    }

    if (_.isEmpty(endpoint.auth.secretIds)) {
      ctx.context.debug(`Creating a new Secret key.`)
      const secretMsg = await CreateApiKey({
        apig: apiClient,
        Region: region,
        secretName: endpoint.auth.secretName,
        type: 'auto'
      })
      ctx.context.debug(
        `Secret key with ID ${secretMsg.secretId} and key ${secretMsg.secretKey} updated.`
      )
      secretIds.value = [secretMsg.secretId]
      secretIds.created = true
    } else {
      endpoint.auth.secretIds = _.uniq(endpoint.auth.secretIds)

      const len = endpoint.auth.secretIds.length
      // get all secretId, check local secretId exists
      const apiKeyResponse = await DescribeApiKeysStatus({
        apig: apiClient,
        secretIds: endpoint.auth.secretIds,
        Region: region,
        limit: len
      })
      const existKeysLen = apiKeyResponse.apiKeyStatusSet.length

      const ids = []
      for (let i = 0; i < len; i++) {
        const secretId = endpoint.auth.secretIds[i]
        let found = false
        let disable = false
        for (let n = 0; n < existKeysLen; n++) {
          if (
            apiKeyResponse.apiKeyStatusSet[n] &&
            secretId == apiKeyResponse.apiKeyStatusSet[n].secretId
          ) {
            if (apiKeyResponse.apiKeyStatusSet[n].status == 1) {
              found = true
            } else {
              disable = true
              ctx.context.debug(`There is a disabled secret key: ${secretId}, cannot be bound`)
            }
            break
          }
        }
        if (!found) {
          if (!disable) {
            ctx.context.debug(`Secret key id ${secretId} does't exist`)
          }
        } else {
          ids.push(secretId)
        }

        secretIds.value = ids
      }
    }

    return {
      usagePlanId,
      secretIds
    }
  }

  const filterUsagePlanSecretId = async (ctx, apig, region, usagePlanId, localSecretIds) => {
    const limit = 100
    const result = await DescribeUsagePlanSecretIds({
      apig: apig,
      Region: region,
      usagePlanId: usagePlanId,
      limit: limit,
      offset: 0
    })

    const localSecretIdsState = {}

    const filterSecretId = (onlineSecretIds, localSecretIds, localSecretIdsState) => {
      const len = _.size(localSecretIds)

      for (let i = 0; i < len; i++) {
        const localSecretId = localSecretIds[i]
        if (_.isUndefined(localSecretIdsState[localSecretId])) {
          localSecretIdsState[localSecretId] = 0
        }

        const findRet = _.find(onlineSecretIds, (onlineSecretIdObj) => {
          if (localSecretId == onlineSecretIdObj.secretId) {
            return onlineSecretIdObj.secretId
          }
        })
        if (findRet) {
          localSecretIdsState[localSecretId]++
          ctx.context.debug(`Usage plan ${usagePlanId} secret id ${localSecretId} already bound`)
        }
      }
    }

    let total = result.totalCount
    let offset = _.size(result.secretIdList)

    total -= offset

    filterSecretId(result.secretIdList, localSecretIds, localSecretIdsState)
    while (total > 0) {
      const resultPart = await DescribeUsagePlanSecretIds({
        apig: apig,
        Region: region,
        usagePlanId: usagePlanId,
        limit: limit,
        offset: offset
      })
      filterSecretId(resultPart.secretIdList, localSecretIds, localSecretIdsState)

      offset += _.size(resultPart.secretIdList)
      total -= _.size(resultPart.secretIdList)
    }

    const ids = []
    _.map(localSecretIdsState, (state, id) => {
      if (state == 0) {
        ids.push(id)
      }
    })
    return ids
  }

  // get service all api list
  const oldApis = await DescribeApisStatus({
    apig: apig,
    Region: region,
    serviceId: serviceId,
    // api max response 100 row
    limit: 100
  })

  const apis = []
  const apiOutputs = []
  const len = endpoints.length
  for (let i = 0; i < len; i++) {
    const endpoint = endpoints[i]

    const requestConfig = {
      path: endpoint.path,
      method: endpoint.method
    }

    const output = {
      path: requestConfig.path,
      method: requestConfig.method
    }

    const api = requestConfig

    const apiInputs = {
      protocol: endpoint.protocol || 'HTTP',
      Region: region,
      serviceId: serviceId,
      apiName: apiName,
      apiDesc: endpoint.description,
      apiType: 'NORMAL',
      authRequired: endpoint.auth ? 'TRUE' : 'FALSE',
      enableCORS: endpoint.enableCORS ? 'TRUE' : 'FALSE',
      serviceType: serviceType,
      requestConfig: requestConfig,
      serviceTimeout: endpoint.serviceTimeout || serviceTimeout,
      responseType: endpoint.responseType || 'HTML'
    }

    const funcName = endpoint.function.functionName
    const funcNamespace = endpoint.function.functionNamespace || 'default'
    const funcQualifier = endpoint.function.functionQualifier
      ? endpoint.function.functionQualifier
      : '$LATEST'
      ? endpoint.function.functionQualifier
      : '$LATEST'

    if (endpoint.protocol === 'WEBSOCKET') {
      if (!endpoint.function.transportFunctionName) {
        throw new Error('"endpoints.function.transportFunctionName" is required')
      }
      apiInputs.serviceWebsocketTransportFunctionName = endpoint.function.transportFunctionName
      apiInputs.serviceWebsocketTransportFunctionQualifier = funcQualifier
      apiInputs.serviceWebsocketTransportFunctionNamespace = funcNamespace

      apiInputs.serviceWebsocketRegisterFunctionName = endpoint.function.registerFunctionName
      apiInputs.serviceWebsocketRegisterFunctionQualifier = funcQualifier
      apiInputs.serviceWebsocketRegisterFunctionNamespace = funcNamespace

      apiInputs.serviceWebsocketCleanupFunctionName = endpoint.function.cleanupFunctionName
      apiInputs.serviceWebsocketCleanupFunctionQualifier = funcQualifier
      apiInputs.serviceWebsocketCleanupFunctionNamespace = funcNamespace
    } else {
      if (!funcName) {
        throw new Error('"endpoints.function.functionName" is required')
      }
      apiInputs.serviceScfFunctionName = funcName
      apiInputs.serviceScfFunctionNamespace = funcNamespace
      ;(apiInputs.serviceScfIsIntegratedResponse = endpoint.function.isIntegratedResponse
        ? 'TRUE'
        : 'FALSE'),
        (apiInputs.serviceScfFunctionQualifier = funcQualifier)
    }

    if (endpoint.param) {
      apiInputs.requestParameters = endpoint.param
    }
    const apiId = {
      value: null,
      created: false
    }

    if (!endpoint.apiId) {
      const oldApi = _.find(oldApis.apiIdStatusSet, (api) => {
        if (
          api.method.toLowerCase() == endpoint.method.toLowerCase() &&
          api.path == endpoint.path
        ) {
          return api
        }
      })

      if (!_.isEmpty(oldApi)) {
        endpoint.apiId = oldApi.apiId

        console.log(
          `Endpoint ${endpoint.method} ${endpoint.path} already exists with id ${oldApi.apiId}.`
        )

        const localApi = _.find(instance.state.apis, (api) => {
          if (api.method.toLowerCase() == oldApi.method.toLowerCase() && api.path == oldApi.path) {
            return api
          }
        })
        if (!_.isEmpty(localApi)) {
          apiId.created = localApi.apiId.created
        }
      }
    }

    if (!endpoint.apiId) {
      apiId.value = await CreateApi({ apig, ...apiInputs })
      apiId.created = true
      console.log(`API with id ${apiId.value} created.`)
      // if websocket, get internalDemain by DescribeApi
      if (endpoint.protocol === 'WEBSOCKET') {
        const { internalDomain } = await DescribeApi({
          apig,
          serviceId,
          apiId: apiId.value,
          Region: region
        })
        apiId.internalDomain = internalDomain
        output.internalDomain = internalDomain
      }
    } else {
      const { internalDomain } = await DescribeApi({
        apig,
        serviceId,
        apiId: endpoint.apiId,
        Region: region
      })

      console.log(`Updating api with api id ${endpoint.apiId}.`)
      await ModifyApi({ apig, apiId: endpoint.apiId, ...apiInputs })
      apiId.value = endpoint.apiId

      if (endpoint.protocol === 'WEBSOCKET') {
        apiId.internalDomain = internalDomain
        output.internalDomain = internalDomain
      }
      console.log(`Service with id ${apiId.value} updated.`)
    }

    api.apiId = apiId
    output.apiId = apiId.value

    if (endpoint.auth) {
      const result = await apiAuthSetting(this, region, apig, endpoint)
      if (!_.isEmpty(result.secretIds.value)) {
        const unboundSecretIds = await filterUsagePlanSecretId(
          this,
          apig,
          region,
          result.usagePlanId.value,
          result.secretIds.value
        )
        if (!_.isEmpty(unboundSecretIds)) {
          console.log(
            `Binding secret key ${unboundSecretIds} to usage plan with id ${result.usagePlanId.value}.`
          )
          await BindSecretIds({
            apig,
            Region: region,
            secretIds: unboundSecretIds,
            usagePlanId: result.usagePlanId.value
          })
          console.log('Binding secret key successed.')
        }
      } else {
        console.log('The auth valid secret key is empty.')
      }

      const apiUsagePlans = await DescribeApiUsagePlan({
        apig: apig,
        serviceId: serviceId,
        Region: region,
        apiIds: [apiId.value]
      })

      const oldUsagePlan = _.find(apiUsagePlans.usagePlanList, (usagePlan) => {
        if (usagePlan.usagePlanId == result.usagePlanId.value) {
          return usagePlan
        }
      })

      if (_.isEmpty(oldUsagePlan)) {
        console.log(
          `Binding usage plan with id ${result.usagePlanId.value} to api id ${apiId.value} path ${endpoint.method} ${endpoint.path}.`
        )

        await BindEnvironment({
          apig,
          Region: region,
          usagePlanIds: [result.usagePlanId.value],
          serviceId,
          environment,
          bindType,
          apiIds: [apiId.value]
        })
        console.log('Binding successed.')
      } else {
        console.log(
          `Usage plan with id ${result.usagePlanId.value} already bind to api id ${apiId.value} path ${endpoint.method} ${endpoint.path}.`
        )
      }

      api.usagePlanId = result.usagePlanId
      api.secretIds = result.secretIds

      output.usagePlanId = result.usagePlanId.value
      output.secretIds = result.secretIds.value.join(',')
    }

    console.log(`Deploying service with id ${serviceId}.`)
    await ReleaseService({
      apig: apig,
      Region: region,
      serviceId: serviceId,
      environmentName: environment,
      releaseDesc: 'Serverless api-gateway component deploy'
    })
    console.log(`Deployment successful for the api named ${apiName} in the ${region} region.`)

    apis.push(api)
    apiOutputs.push(output)
  }

  // 1. unbind all custom domain
  const { customDomain } = inputs
  const customDomainDetail = await DescribeServiceSubDomains({
    apig: apig,
    Region: region,
    serviceId
  })
  if (
    customDomainDetail &&
    customDomainDetail.domainSet &&
    customDomainDetail.domainSet.length > 0
  ) {
    console.log(`Start unbind all exist domain for service ${serviceId}`)
    const { domainSet = [] } = customDomainDetail
    // unbind all exist domain
    for (let i = 0; i < domainSet.length; i++) {
      const domainItem = domainSet[i]
      await UnBindSubDomain({
        apig: apig,
        Region: region,
        serviceId,
        subDomain: domainItem.domainName
      })
    }
  }
  // 2. bind user config domain
  const customDomainOutput = []
  if (customDomain && customDomain.length > 0) {
    console.log(`Start bind custom domain for service ${serviceId}`)
    for (let i = 0; i < customDomain.length; i++) {
      const domainItem = customDomain[i]
      const domainProtocol = domainItem.protocols
        ? this.getProtocolString(domainItem.protocols)
        : protocol
      const domainInputs = {
        apig: apig,
        Region: region,
        serviceId,
        subDomain: domainItem.domain,
        certificateId: domainItem.certificateId,
        isDefaultMapping: domainItem.isDefaultMapping || 'TRUE',
        pathMappingSet: domainItem.pathMappingSet || [],
        protocol: domainProtocol
      }
      await BindSubDomain(domainInputs)
      customDomainOutput.push({
        domain: domainItem.domain,
        cname: subDomain
      })
      console.log(`Custom domain for service ${serviceId} created successfullly.`)
      console.log(`Please add CNAME record ${subDomain} for ${domainItem.domain}.`)
    }
  }

  const outputs = {
    protocols,
    subDomain,
    environment,
    region,
    serviceId,
    apis: apiOutputs
  }

  if (customDomainOutput.length > 0) {
    outputs.customDomains = customDomainOutput
    state.customDomains = customDomainOutput
  }

  state.apis = apis
  instance.state = { ...instance.state, ...state }

  return outputs
}

const removeApi = async (apig, instance) => {
  // login
  console.log('Removing api')

  if (!instance.state.apis) {
    console.log(`Aborting removal. function name not found in state.`)
    return
  }

  const state = instance.state
  const region = state.region
  const apisLen = state.apis.length

  // get service all api list
  const oldApis = await DescribeApisStatus({
    apig: apig,
    Region: region,
    serviceId: state.service.value,
    // api max response 100 row
    limit: 100
  })

  for (let i = 0; i < apisLen; i++) {
    const endpoint = state.apis[i]
    if (!endpoint.apiId) {
      continue
    }
    const oldEndpoint = _.find(oldApis.apiIdStatusSet, (item) => {
      if (endpoint.apiId.value == item.apiId) {
        return item
      }
    })

    if (_.isEmpty(oldEndpoint)) {
      console.log(`Api resource dont't exixts ID ${endpoint.apiId.value}.`)
      continue
    }

    if (endpoint.usagePlanId) {
      if (!_.isEmpty(endpoint.secretIds.value)) {
        // await UnBindSecretIds({ apig, Region: region,
        //           secretIds: endpoint.secretIds.value,
        //           usagePlanId: endpoint.usagePlanId.value })
        await UnBindSecretIds({
          apig: apig,
          Region: region,
          secretIds: endpoint.secretIds.value,
          usagePlanId: endpoint.usagePlanId.value
        })
        console.log(`Unbinding secret key to usage plan with ID ${endpoint.usagePlanId.value}.`)
      }

      await UnBindEnvironment({
        apig: apig,
        Region: region,
        serviceId: state.service.value,
        usagePlanIds: [endpoint.usagePlanId.value],
        environment: state.environment,
        bindType: bindType,
        apiIds: [endpoint.apiId.value]
      })
      console.log(
        `Unbinding usage plan with ID ${endpoint.usagePlanId.value} to service with ID ${state.service.value}.`
      )

      if (endpoint.usagePlanId.created == true) {
        console.log(`Removing any previously deployed usage plan ids ${endpoint.usagePlanId.value}`)
        await DeleteUsagePlan({ apig, Region: region, usagePlanId: endpoint.usagePlanId.value })
      }
    }

    if (endpoint.secretIds && endpoint.secretIds.created == true) {
      endpoint.secretIds.value.map(async (secretId) => {
        await DisableApiKey({ apig, Region: region, secretId })
        await DeleteApiKey({ apig, Region: region, secretId })
        console.log(`Removing any previously deployed secret key. ${secretId}`)
      })
    }
    if (endpoint.apiId && endpoint.apiId.created == true) {
      await DeleteApi({
        apig: apig,
        Region: region,
        apiId: endpoint.apiId.value,
        serviceId: state.service.value
      })
      console.log(`Removing any previously deployed API. ${endpoint.apiId.value}`)
    }
  }

  // unbind all exist domain
  const { customDomains = [] } = instance.state
  for (let i = 0; i < customDomains.length; i++) {
    const domainItem = customDomains[i]
    await UnBindSubDomain({
      apig: apig,
      Region: region,
      serviceId: state.service.value,
      subDomain: domainItem.domain
    })
    console.log(`Removing custom domain ${domainItem.domain}`)
  }

  await UnReleaseService({
    apig: apig,
    Region: region,
    serviceId: state.service.value,
    environmentName: state.environment,
    unReleaseDesc: 'Serverless API-Gateway component offline'
  })

  if (state.service.created == true) {
    console.log(`Removing any previously deployed service. ${state.service.value}`)
    await DeleteService({
      apig: apig,
      serviceId: state.service.value,
      Region: region
    })
  }
  instance.state = {}
}

module.exports = {
  getTencentSCFByName,
  createTencentSCF,
  updateTencentSCFConf,
  updateTencentSCFCode,
  deleteTencentSCF,
  createOrUpdateApi,
  removeApi
}
