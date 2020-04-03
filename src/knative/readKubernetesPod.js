const KubernetesPod = require('@serverless/kubernetes-pod')

async function readKubernetesPod(config) {
  const instance = new KubernetesPod()
  instance.credentials = this.credentials
  return instance.read(config)
}

module.exports = readKubernetesPod
