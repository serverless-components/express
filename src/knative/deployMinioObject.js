const MinioObject = require('@serverless/minio-object')

async function deployMinioObject(config) {
  const instance = new MinioObject()
  instance.credentials = this.credentials
  instance.unzip = this.unzip
  return instance.deploy(config)
}

module.exports = deployMinioObject
