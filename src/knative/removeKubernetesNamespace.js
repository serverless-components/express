const KubernetesNamespace = require('@serverless/kubernetes-namespace')

async function removeKubernetesNamespace(config) {
  const instance = new KubernetesNamespace()
  instance.credentials = this.credentials
  return instance.remove(config)
}

module.exports = removeKubernetesNamespace
