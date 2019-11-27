const { equals, isEmpty, has, not, pick, type, mergeDeepRight } = require('ramda')
const AWS = require('aws-sdk')

const random = Math.random()
  .toString(36)
  .substring(6)

const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait))

const addRolePolicy = async ({ iam, name, policy }) => {
  if (has('arn', policy)) {
    await iam
      .attachRolePolicy({
        RoleName: name,
        PolicyArn: policy.arn
      })
      .promise()
  } else if (!isEmpty(policy)) {
    await iam
      .putRolePolicy({
        RoleName: name,
        PolicyName: `${name}-policy`,
        PolicyDocument: JSON.stringify(policy)
      })
      .promise()
  }

  return sleep(10000)
}

const removeRolePolicy = async ({ iam, name, policy }) => {
  if (has('arn', policy)) {
    await iam
      .detachRolePolicy({
        RoleName: name,
        PolicyArn: policy.arn
      })
      .promise()
  } else if (!isEmpty(policy)) {
    await iam
      .deleteRolePolicy({
        RoleName: name,
        PolicyName: `${name}-policy`
      })
      .promise()
  }
}

const createRole = async ({ iam, name, service, policy }) => {
  const assumeRolePolicyDocument = {
    Version: '2012-10-17',
    Statement: {
      Effect: 'Allow',
      Principal: {
        Service: service
      },
      Action: 'sts:AssumeRole'
    }
  }
  const roleRes = await iam
    .createRole({
      RoleName: name,
      Path: '/',
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument)
    })
    .promise()

  await addRolePolicy({
    iam,
    name,
    policy
  })

  return roleRes.Role.Arn
}

const deleteRole = async ({ iam, name, policy }) => {
  try {
    await removeRolePolicy({
      iam,
      name,
      policy
    })
    await iam
      .deleteRole({
        RoleName: name
      })
      .promise()
  } catch (error) {
    if (error.message !== `Policy ${policy.arn} was not found.` && error.code !== 'NoSuchEntity') {
      throw error
    }
  }
}

const getRole = async ({ iam, name }) => {
  try {
    const res = await iam.getRole({ RoleName: name }).promise()
    // todo add policy
    return {
      name: res.Role.RoleName,
      arn: res.Role.Arn,
      service: JSON.parse(decodeURIComponent(res.Role.AssumeRolePolicyDocument)).Statement[0]
        .Principal.Service
    }
  } catch (e) {
    if (e.message.includes('cannot be found')) {
      return null
    }
    throw e
  }
}

const updateAssumeRolePolicy = async ({ iam, name, service }) => {
  const assumeRolePolicyDocument = {
    Version: '2012-10-17',
    Statement: {
      Effect: 'Allow',
      Principal: {
        Service: service
      },
      Action: 'sts:AssumeRole'
    }
  }
  await iam
    .updateAssumeRolePolicy({
      RoleName: name,
      PolicyDocument: JSON.stringify(assumeRolePolicyDocument)
    })
    .promise()
}

const inputsChanged = (prevRole, role) => {
  // todo add name and policy
  const inputs = pick(['service'], role)
  const prevInputs = pick(['service'], prevRole)

  if (type(inputs.service) === 'Array') {
    inputs.service.sort()
  }
  if (type(prevInputs.service) === 'Array') {
    prevInputs.service.sort()
  }

  return not(equals(inputs, prevInputs))
}

const defaults = {
  service: 'lambda.amazonaws.com',
  policy: {
    arn: 'arn:aws:iam::aws:policy/AdministratorAccess'
  },
  region: 'us-east-1'
}

// todo pass region to inputs
const deployRole = async (inputs = {}, instance) => {
  inputs.region = inputs.region || 'us-east-1'

  inputs = mergeDeepRight(defaults, inputs)

  const iam = new AWS.IAM({ credentials: instance.credentials.aws, region: inputs.region })

  if (!instance.state.role) {
    instance.state.role = {}
  }

  inputs.name = inputs.name || instance.state.role.name || `express-${random}`

  const prevRole = await getRole({ iam, ...inputs })

  // If an inline policy, remove ARN
  if (inputs.policy && inputs.policy.Version && inputs.policy.Statement) {
    if (inputs.policy.arn) {
      delete inputs.policy.arn
    }
  }

  if (!prevRole) {
    await instance.debug(`Creating role ${inputs.name}.`)
    await instance.status(`Creating Role`)
    inputs.arn = await createRole({ iam, ...inputs })
  } else {
    inputs.arn = prevRole.arn

    if (inputsChanged(prevRole, inputs)) {
      await instance.status(`Updating`)
      if (prevRole.service !== inputs.service) {
        await instance.debug(`Updating service for role ${inputs.name}.`)
        await updateAssumeRolePolicy({ iam, ...inputs })
      }
      if (!equals(prevRole.policy, inputs.policy)) {
        await instance.debug(`Updating policy for role ${inputs.name}.`)
        await removeRolePolicy({ iam, ...inputs })
        await addRolePolicy({ iam, ...inputs })
      }
    }
  }

  // todo we probably don't need this logic now that
  // we auto generate unconfigurable names
  if (instance.state.role.name && instance.state.role.name !== inputs.name) {
    await instance.status(`Replacing`)
    await instance.debug(`Deleting/Replacing role ${inputs.name}.`)
    await deleteRole({ iam, name: instance.state.role.name, policy: inputs.policy })
  }

  instance.state.role.name = inputs.name
  instance.state.role.arn = inputs.arn
  instance.state.role.service = inputs.service
  instance.state.role.policy = inputs.policy
  instance.state.role.region = inputs.region
  await instance.save()

  await instance.debug(`Saved state for role ${inputs.name}.`)

  const outputs = {
    name: inputs.name,
    arn: inputs.arn
  }

  await instance.debug(`Role ${inputs.name} was successfully deployed to region ${inputs.region}.`)
  await instance.debug(`Deployed role arn is ${inputs.arn}.`)

  return outputs
}

module.exports = {
  deployRole,
  createRole,
  deleteRole,
  getRole,
  addRolePolicy,
  removeRolePolicy,
  updateAssumeRolePolicy,
  inputsChanged
}
