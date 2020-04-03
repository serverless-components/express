const KubernetesConfigMap = require('@serverless/kubernetes-configmap')

async function deployKubernetesConfigMap(config) {
  const instance = new KubernetesConfigMap()
  instance.credentials = this.credentials
  return instance.deploy(config)
}

module.exports = deployKubernetesConfigMap
