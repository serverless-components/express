const KubernetesPod = require('@serverless/kubernetes-pod')

async function removeKubernetesPod(config) {
  const instance = new KubernetesPod()
  instance.credentials = this.credentials
  return instance.remove(config)
}

module.exports = removeKubernetesPod
