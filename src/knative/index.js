// `deploy`
const deployKubernetesConfigMap = require('./deployKubernetesConfigMap')
const deployKnativeServing = require('./deployKnativeServing')
const deployMinioBucket = require('./deployMinioBucket')
const deployMinioObject = require('./deployMinioObject')
const deployKubernetesNamespace = require('./deployKubernetesNamespace')
const deployKubernetesPod = require('./deployKubernetesPod')
// `read`
const readKubernetesPod = require('./readKubernetesPod')
// `remove`
const removeMinioBucket = require('./removeMinioBucket')
const removeKubernetesNamespace = require('./removeKubernetesNamespace')
const removeKubernetesPod = require('./removeKubernetesPod')
// `utils`
const { tgz, sleep } = require('./utils')

module.exports = {
  // Components
  deployKubernetesConfigMap,
  deployKnativeServing,
  deployMinioBucket,
  deployMinioObject,
  deployKubernetesNamespace,
  deployKubernetesPod,
  readKubernetesPod,
  removeMinioBucket,
  removeKubernetesNamespace,
  removeKubernetesPod,
  // Utils
  tgz,
  sleep
}
