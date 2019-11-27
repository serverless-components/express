const path = require('path')
const AdmZip = require('adm-zip')
const globby = require('globby')
const { contains, isNil, last, split, mergeDeepRight, pick } = require('ramda')
const { readFile } = require('fs-extra')
const AWS = require('aws-sdk')

const random = Math.random()
  .toString(36)
  .substring(6)

const pack = async (inputDirPath, outputFilePath, include = [], exclude = []) => {
  const format = last(split('.', outputFilePath))

  if (!contains(format, ['zip', 'tar'])) {
    throw new Error('Please provide a valid format. Either a "zip" or a "tar"')
  }

  const patterns = ['**']

  if (!isNil(exclude)) {
    exclude.forEach((excludedItem) => patterns.push(`!${excludedItem}`))
  }

  const zip = new AdmZip()

  const files = (await globby(patterns, { cwd: inputDirPath })).sort()

  files.map((file) => {
    if (file === path.basename(file)) {
      zip.addLocalFile(path.join(inputDirPath, file))
    } else {
      zip.addLocalFile(path.join(inputDirPath, file), path.dirname(file))
    }
  })

  if (!isNil(include)) {
    include.forEach((file) => zip.addLocalFile(file))
  }

  zip.writeZip(outputFilePath)

  return outputFilePath
}

const createLambda = async ({
  lambda,
  name,
  handler,
  memory,
  timeout,
  runtime,
  env,
  description,
  zipPath,
  role,
  layer
}) => {
  const params = {
    FunctionName: name,
    Code: {},
    Description: description,
    Handler: handler,
    MemorySize: memory,
    Publish: true,
    Role: role.arn,
    Runtime: runtime,
    Timeout: timeout,
    Environment: {
      Variables: env
    }
  }

  if (layer && layer.arn) {
    params.Layers = [layer.arn]
  }

  params.Code.ZipFile = await readFile(zipPath)

  const res = await lambda.createFunction(params).promise()

  return { arn: res.FunctionArn, hash: res.CodeSha256 }
}

const updateLambdaConfig = async ({
  lambda,
  name,
  handler,
  memory,
  timeout,
  runtime,
  env,
  description,
  role,
  layer
}) => {
  const functionConfigParams = {
    FunctionName: name,
    Description: description,
    Handler: handler,
    MemorySize: memory,
    Role: role.arn,
    Runtime: runtime,
    Timeout: timeout,
    Environment: {
      Variables: env
    }
  }

  if (layer && layer.arn) {
    functionConfigParams.Layers = [layer.arn]
  }

  const res = await lambda.updateFunctionConfiguration(functionConfigParams).promise()

  return { arn: res.FunctionArn, hash: res.CodeSha256 }
}

const updateLambdaCode = async ({ lambda, name, zipPath }) => {
  const functionCodeParams = {
    FunctionName: name,
    Publish: true
  }

  functionCodeParams.ZipFile = await readFile(zipPath)

  const res = await lambda.updateFunctionCode(functionCodeParams).promise()

  return res.FunctionArn
}

const getLambda = async ({ lambda, name }) => {
  try {
    const res = await lambda
      .getFunctionConfiguration({
        FunctionName: name
      })
      .promise()

    return {
      name: res.FunctionName,
      description: res.Description,
      timeout: res.Timeout,
      runtime: res.Runtime,
      role: {
        arn: res.Role
      },
      handler: res.Handler,
      memory: res.MemorySize,
      hash: res.CodeSha256,
      env: res.Environment ? res.Environment.Variables : {},
      arn: res.FunctionArn
    }
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      return null
    }
    throw e
  }
}

const deleteLambda = async ({ lambda, name }) => {
  try {
    const params = { FunctionName: name }
    await lambda.deleteFunction(params).promise()
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') {
      throw error
    }
  }
}

const outputsList = [
  'name',
  'description',
  'memory',
  'timeout',
  'shims',
  'handler',
  'runtime',
  'env',
  'role',
  'arn',
  'region'
]

const defaults = {
  description: 'AWS Lambda Component',
  memory: 512,
  timeout: 10,
  bucket: undefined,
  shims: [],
  handler: 'index.handler',
  runtime: 'nodejs10.x',
  env: {},
  region: 'us-east-1'
}

const deployLambda = async (inputs = {}, instance) => {
  await instance.status(`Deploying Lambda`)

  const config = mergeDeepRight(defaults, inputs)

  if (!instance.state.lambda) {
    instance.state.lambda = {}
  }

  config.name = inputs.name || instance.state.lambda.name || `express-${random}`

  await instance.debug(
    `Starting deployment of lambda ${config.name} to the ${config.region} region.`
  )

  const lambda = new AWS.Lambda({
    region: config.region,
    credentials: instance.credentials.aws
  })

  const prevLambda = await getLambda({ lambda, ...config })

  const inputDirPath = config.src
  const outputFilePath = path.join(
    '/tmp',
    `${Math.random()
      .toString(36)
      .substring(6)}.zip`
  )

  const shimsDir = path.join(__dirname, 'shims')
  const include = [
    path.join(shimsDir, 'binary-case.js'),
    path.join(shimsDir, 'index.js'),
    path.join(shimsDir, 'media-typer.js'),
    path.join(shimsDir, 'middleware.js'),
    path.join(shimsDir, 'mime-db.json'),
    path.join(shimsDir, 'mime-types.js'),
    path.join(shimsDir, 'type-is.js')
  ]

  await instance.debug(`packging from ${inputDirPath}`)
  await pack(inputDirPath, outputFilePath, include)

  config.zipPath = outputFilePath

  if (!prevLambda) {
    await instance.status(`Creating Lambda`)
    await instance.debug(`Creating lambda ${config.name} in the ${config.region} region.`)

    const createResult = await createLambda({ lambda, ...config })
    config.arn = createResult.arn
  } else {
    config.arn = prevLambda.arn
    await instance.status(`Updating Lambda`)
    await instance.debug(`Updating ${config.name} lambda.`)

    await updateLambdaConfig({ lambda, ...config })
    await updateLambdaCode({ lambda, ...config })
  }

  if (instance.state.lambda.name && instance.state.lambda.name !== config.name) {
    await instance.status(`Replacing`)
    await deleteLambda({ lambda, name: instance.state.lambda.name })
  }

  await instance.debug(
    `Successfully deployed lambda ${config.name} in the ${config.region} region.`
  )

  const outputs = pick(outputsList, config)

  instance.state.lambda = outputs
  await instance.save()

  return outputs
}

module.exports = {
  pack,
  createLambda,
  updateLambdaCode,
  updateLambdaConfig,
  getLambda,
  deleteLambda,
  deployLambda
}
