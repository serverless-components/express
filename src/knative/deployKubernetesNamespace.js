const KubernetesNamespace = require('@serverless/kubernetes-namespace')

async function deployKubernetesNamespace(config) {
  const instance = new KubernetesNamespace()
  instance.credentials = this.credentials
  return instance.deploy(config)
}

module.exports = deployKubernetesNamespace
