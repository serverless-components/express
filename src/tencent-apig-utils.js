const Joi = require('joi')

function HttpError(code, message) {
  this.code = code || 0
  this.message = message || ''
}
HttpError.prototype = Error.prototype

const CheckExistsFromError = (err) => {
  if (err && err.message.match('does not exist')) {
    return false
  }
  if (err && err.message.match('not found')) {
    return false
  }
  return true
}

const CreateService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'CreateService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.data)
      }
    )
  })
}

const DeleteService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DeleteService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.data)
      }
    )
  })
}

const DescribeService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const CreateApi = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'CreateApi',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.apiId)
      }
    )
  })
}

const DescribeApi = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeApi',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DescribeApiUsagePlan = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeApiUsagePlan',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const ModifyApi = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'ModifyApi',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.apiId)
      }
    )
  })
}

const ModifyService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'ModifyService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.serviceId)
      }
    )
  })
}

const DescribeUsagePlanSecretIds = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeUsagePlanSecretIds',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DescribeUsagePlan = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeUsagePlan',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const CreateUsagePlan = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'CreateUsagePlan',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.usagePlanId)
      }
    )
  })
}

const ModifyUsagePlan = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'ModifyUsagePlan',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data.usagePlanId)
      }
    )
  })
}

const CreateApiKey = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'CreateApiKey',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DescribeApiKeysStatus = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeApiKeysStatus',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const BindSecretIds = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'BindSecretIds',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const BindEnvironment = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'BindEnvironment',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const ReleaseService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'ReleaseService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const UnReleaseService = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'UnReleaseService',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DeleteApi = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DeleteApi',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const UnBindSecretIds = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'UnBindSecretIds',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          if (CheckExistsFromError(data)) {
            return reject(new HttpError(data.code, data.message))
          }
        }
        resolve(data)
      }
    )
  })
}

const UnBindEnvironment = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'UnBindEnvironment',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          if (CheckExistsFromError(data)) {
            return reject(new HttpError(data.code, data.message))
          }
        }
        resolve(data)
      }
    )
  })
}

const DeleteUsagePlan = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DeleteUsagePlan',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          if (CheckExistsFromError(data)) {
            return reject(new HttpError(data.code, data.message))
          }
        }
        resolve(data)
      }
    )
  })
}

const DeleteApiKey = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DeleteApiKey',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          if (CheckExistsFromError(data)) {
            return reject(new HttpError(data.code, data.message))
          }
        }
        resolve(data)
      }
    )
  })
}

const DescribeApisStatus = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeApisStatus',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DisableApiKey = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DisableApiKey',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const BindSubDomain = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'BindSubDomain',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const UnBindSubDomain = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'UnBindSubDomain',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const ModifySubDomain = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'ModifySubDomain',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const DescribeServiceSubDomains = ({ apig, ...inputs }) => {
  return new Promise((resolve, reject) => {
    apig.request(
      {
        Action: 'DescribeServiceSubDomains',
        RequestClient: 'ServerlessComponent',
        Token: apig.defaults.Token || null,
        ...inputs
      },
      function(err, data) {
        if (err) {
          return reject(err)
        } else if (data.code !== 0) {
          return reject(new HttpError(data.code, data.message))
        }
        resolve(data)
      }
    )
  })
}

const Validate = (config) => {
  const usagePlanScheme = {
    usagePlanId: Joi.string().optional(),
    usagePlanDesc: Joi.string()
      .max(200)
      .optional(),
    // -1 disable quota
    maxRequestNum: Joi.number()
      .integer()
      .min(1)
      .max(99999999)
      .optional()
      .default(-1),
    maxRequestNumPreSec: Joi.number()
      .integer()
      .min(1)
      .max(2000)
      .optional()
      .default(1000),
    usagePlanName: Joi.string()
      .min(2)
      .max(50)
      .required()
      .error(new Error('"usagePlan.usagePlanName" is required'))
  }

  // Api returns a maximum of 100 rows of records at a time
  const endpointsScheme = Joi.array()
    .max(100)
    .items(
      Joi.object().keys({
        apiId: Joi.string().optional(),
        description: Joi.string()
          .max(200)
          .optional(),
        enableCORS: Joi.boolean()
          .optional()
          .default(false),
        path: Joi.string().required(),
        method: Joi.string()
          .regex(/^(GET|POST|PUT|DELETE|HEAD|ANY)$/)
          .required(),
        function: Joi.object()
          .keys({
            isIntegratedResponse: Joi.boolean()
              .optional()
              .default(false),
            functionQualifier: Joi.string()
              .optional()
              .default('$LATEST')
          })
          .required(),
        usagePlan: Joi.object().keys(usagePlanScheme),
        auth: {
          serviceTimeout: Joi.number()
            .integer()
            .optional()
            .default(15),
          secretName: Joi.string().required(),
          // Api returns a maximum of 100 rows of records at a time
          // https://cloud.tencent.com/document/product/628/14920
          secretIds: Joi.array().max(100)
        }
      })
    )
    .required()

  const globalScheme = Joi.object()
    .keys({
      region: Joi.string()
        .optional()
        .default('ap-guangzhou'),
      serviceId: Joi.string().optional(),
      protocols: Joi.array()
        .items(Joi.string().regex(/^(http|https)$/))
        .optional()
        .default(['http']),
      serviceName: Joi.string()
        .min(2)
        .max(50)
        .required()
        .error(new Error('"serviceName" is required')),
      description: Joi.string()
        .max(200)
        .optional(),
      environment: Joi.string()
        .regex(/^(prepub|test|release)$/)
        .optional()
        .default('release'),
      endpoints: endpointsScheme
      // usagePlan: Joi.object().keys(usagePlanScheme)
    })
    .options({ allowUnknown: true })

  const gloalResult = Joi.validate(config, globalScheme)
  if (gloalResult.error) {
    throw gloalResult.error
  }

  return gloalResult.value
}

module.exports = {
  CreateService,
  CreateApi,
  DescribeApisStatus,
  ModifyApi,
  ModifyService,
  CreateUsagePlan,
  ModifyUsagePlan,
  CreateApiKey,
  BindSecretIds,
  BindEnvironment,
  ReleaseService,
  DescribeService,
  UnReleaseService,
  DeleteApi,
  UnBindSecretIds,
  UnBindEnvironment,
  DeleteUsagePlan,
  DeleteApiKey,
  DisableApiKey,
  DescribeUsagePlan,
  Validate,
  DescribeApiKeysStatus,
  DeleteService,
  DescribeApi,
  DescribeUsagePlanSecretIds,
  DescribeApiUsagePlan,
  CheckExistsFromError,
  BindSubDomain,
  UnBindSubDomain,
  ModifySubDomain,
  DescribeServiceSubDomains
}
