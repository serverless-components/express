const KubernetesPod = require('@serverless/kubernetes-pod')

async function deployKubernetesPod(config) {
  const instance = new KubernetesPod()
  instance.credentials = this.credentials
  return instance.deploy(config)
}

module.exports = deployKubernetesPod
