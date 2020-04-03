const MinioBucket = require('@serverless/minio-bucket')

async function deployMinioBucket(config) {
  const instance = new MinioBucket()
  instance.credentials = this.credentials
  return instance.deploy(config)
}

module.exports = deployMinioBucket
