const MiniBucket = require('@serverless/minio-bucket')

async function removeMinioBucket(config) {
  const instance = new MiniBucket()
  instance.credentials = this.credentials
  return instance.remove(config)
}

module.exports = removeMinioBucket
