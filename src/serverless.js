const { Component } = require('@serverless/core')
const moment = require('moment')
const {
  generateId,
  getClients,
  packageExpress,
  createOrUpdateFunctionRole,
  createOrUpdateMetaRole,
  createOrUpdateLambda,
  createOrUpdateAlias,
  createOrUpdateApi,
  createOrUpdateDomain,
  removeApi,
  removeAllRoles,
  removeLambda,
  removeDomain,
  getMetrics
} = require('./utils')
const {
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
  sleep,
  tgz
} = require('./knative')

class Express extends Component {
  /**
   * Deploy
   * @param {object} inputs
   */
  async deploy(inputs) {
    console.log(`Deploying Express App...`)

    // --- START: KNATIVE CODE PATH ---
    if (!!Object.keys(this.credentials.kubernetes).length) {
      // extracting the necessary credentials at a single place
      const DOCKER_USERNAME = this.credentials.docker.username
      const DOCKER_AUTH = this.credentials.docker.auth
      const MINIO_ENDPOINT = this.credentials.minio.endpoint
      const MINIO_PORT = this.credentials.minio.port
      const MINIO_ACCESS_KEY = this.credentials.minio.accessKey
      const MINIO_SECRET_KEY = this.credentials.minio.secretKey

      const appName = this.name

      const defaults = {
        prefix: `${appName}-${generateId()}`
      }

      const config = {
        ...defaults,
        ...inputs,
        ...this.state
      }

      // 1. Ensure K8S Namespace
      console.log('Deploying K8S Namespace...')
      const ns = await deployKubernetesNamespace.call(this, {
        name: config.prefix
      })
      const namespace = ns.name
      config.namespace = namespace

      // 2. Ensure K8S ConfigMap which serves the Docker credentials
      console.log('Deploying K8S ConfigMap...')
      const cm = await deployKubernetesConfigMap.call(this, {
        namespace,
        name: 'docker-config',
        data: {
          'config.json': `{ "auths": { "https://index.docker.io/v1/": { "auth": "${DOCKER_AUTH}" } } }`
        }
      })
      const configMapName = cm.name

      // 3. Ensure Minio Bucket
      console.log('Deploying Minio Bucket...')
      const mBucket = await deployMinioBucket.call(this, { name: config.prefix })
      const bucket = mBucket.name
      config.bucket = bucket

      // 4. Create tar of source code
      // HACK: Here we're basically working around the problem that we need a `tar.gz` file
      //   while Serverless Components only support `.zip` files.
      // NOTE: We need to use `this.src` here, otherwise we might reference
      //   something invalid due to weird state savings when deployments fail halfway through
      const unzippedSrcDirPath = await this.unzip(inputs.src)
      const tarFileName = `${config.prefix}.tar.gz`
      const tarResult = await tgz(unzippedSrcDirPath, tarFileName)
      const zippedTarDirPath = await this.zip(tarResult.destPath)

      // 5. Upload tar file to Minio Bucket
      console.log('Deploying Minio Object...')
      const mObject = await deployMinioObject.call(this, {
        bucket,
        src: zippedTarDirPath,
        name: tarFileName
      })
      const objectName = mObject.name

      // 6. Run Kaniko via K8S Pod
      // HACK: Using a random Number as a tag forces a Knative Serving re-deployment
      //   We should use a checksum of the tarball later on
      console.log('Deploying K8S Pod...')
      const dockerRepo = `${DOCKER_USERNAME}/${appName}`
      const dockerTag = generateId()
      const pod = await deployKubernetesPod.call(this, {
        namespace,
        // NOTE: We give every pod a unique name so that Pod removal can fail silently later on
        //   (once something goes wrong. It will eventually be cleaned-up when the K8S Namespace is removed)
        name: `${config.prefix}-${dockerTag}-kaniko`,
        spec: {
          containers: [
            {
              name: `${config.prefix}-kaniko`,
              image: 'gcr.io/kaniko-project/executor:latest',
              args: [
                '--dockerfile=Dockerfile',
                `--context=s3://${bucket}/${objectName}`,
                `--destination=${dockerRepo}:${dockerTag}`
              ],
              env: [
                {
                  name: 'AWS_ACCESS_KEY_ID',
                  value: `${MINIO_ACCESS_KEY}`
                },
                {
                  name: 'AWS_SECRET_ACCESS_KEY',
                  value: `${MINIO_SECRET_KEY}`
                },
                {
                  name: 'AWS_REGION',
                  value: 'us-east-1'
                },
                {
                  name: 'S3_ENDPOINT',
                  // TODO: One might want to use SSL here...
                  value: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`
                },
                {
                  name: 'S3_FORCE_PATH_STYLE',
                  value: 'true'
                }
              ],
              volumeMounts: [
                {
                  name: `${configMapName}`,
                  mountPath: '/kaniko/.docker/'
                }
              ]
            }
          ],
          restartPolicy: 'Never',
          volumes: [
            {
              name: `${configMapName}`,
              configMap: {
                name: `${configMapName}`
              }
            }
          ]
        }
      })
      const podName = pod.name

      // 7. Wait until Kaniko K8S Pod is done
      // HACK: We should automate this via Tekton Pipelines later on
      // HACK: Artificially wait 5 seconds because Pods might not spin up immediately
      let isKanikoDone = false
      do {
        await sleep(5000)
        const info = await readKubernetesPod.call(this, {
          namespace,
          name: podName
        })
        const { phase } = info.status
        if (phase === 'Succeeded') {
          isKanikoDone = true
        } else if (phase === 'Failed') {
          throw new Error(`Deployment of Pod "${podName}" failed...`)
        } else {
          console.log(`Monitoring "${podName}" (currently in "${phase}" phase)...`)
        }
      } while (!isKanikoDone)

      // 8. Remove "old" Kaniko Pod
      // HACK: We should automate this via Tekton Pipelines later on
      console.log('Removing K8S Pod...')
      try {
        await removeKubernetesPod.call(this, {
          namespace,
          name: podName
        })
      } catch (error) {
        console.log(`Removal of Pod "${podName} failed with error ${error.message}"...`)
        console.log("Not an issue since it'll be cleaned up when the Namespace is removed...")
      }

      // 9. Deploy Knative Serving service
      console.log('Deploying Knative Serving...')
      const knative = await deployKnativeServing.call(this, {
        namespace,
        name: `${config.prefix}-knative`,
        repository: dockerRepo,
        tag: dockerTag
      })
      config.serviceUrl = knative.serviceUrl

      this.state = config
      return this.state
    }
    // --- END: KNATIVE CODE PATH ---

    // Validate
    if (inputs.timeout && inputs.timeout > 30) {
      throw new Error('"timeout" can not be greater than 30 seconds.')
    }

    // Set app name & region or use previously set name
    this.state.name = this.state.name || `${this.name}-${generateId()}`
    this.state.region = inputs.region || 'us-east-1'

    const clients = getClients(this.credentials.aws, inputs.region)

    await packageExpress(this, inputs)

    await Promise.all([
      createOrUpdateFunctionRole(this, inputs, clients),
      createOrUpdateMetaRole(this, inputs, clients, this.accountId)
    ])

    await createOrUpdateLambda(this, inputs, clients)

    await createOrUpdateAlias(this, inputs, clients)

    await createOrUpdateApi(this, inputs, clients)

    if (inputs.domain) {
      await createOrUpdateDomain(this, inputs, clients)
    } else {
      if (this.state.domain) {
        delete this.state.domain
      }
    }

    const outputs = {}
    outputs.url = this.state.url
    if (this.state.domain) {
      outputs.domain = `https://${this.state.domain}`
    }

    return outputs
  }

  /**
   * Remove
   */
  async remove() {
    // --- START: KNATIVE CODE PATH ---
    if (!!Object.keys(this.credentials.kubernetes).length) {
      const config = {
        ...this.state
      }

      // 1. Remove the Minio bucket
      console.log('Removing Minio Bucket...')
      await removeMinioBucket.call(this, { name: config.bucket })

      // 2. Remove the K8S Namespace
      console.log('Removing K8S Namespace...')
      await removeKubernetesNamespace.call(this, { name: config.namespace })

      this.state = {}
      return {}
    }
    // --- END: KNATIVE CODE PATH ---

    const clients = getClients(this.credentials.aws, this.state.region)

    await removeAllRoles(this, clients)
    await removeLambda(this, clients)
    await removeDomain(this, clients)
    await removeApi(this, clients)

    this.state = {}
    return {}
  }

  /**
   * Metrics
   */
  async metrics(inputs = {}) {
    // Validate
    if (!inputs.rangeStart || !inputs.rangeEnd) {
      throw new Error('rangeStart and rangeEnd are require inputs')
    }

    inputs.rangeStart = moment(inputs.rangeStart)
    inputs.rangeEnd = moment(inputs.rangeEnd)

    // Validate: Start is before End
    if (inputs.rangeStart.isAfter(inputs.rangeEnd)) {
      throw new Error(`The rangeStart provided is after the rangeEnd`)
    }

    // Validate: End is not longer than 30 days
    if (inputs.rangeStart.diff(inputs.rangeEnd, 'days') >= 31) {
      throw new Error(
        `The range cannot be longer than 30 days.  The supplied range is: ${inputs.rangeStart.diff(
          inputs.rangeEnd,
          'days'
        )}`
      )
    }

    const result = await getMetrics(
      this.credentials.aws,
      this.state.region,
      this.state.metaRoleArn,
      this.state.apiId,
      inputs.rangeStart,
      inputs.rangeEnd
    )

    return result
  }
}

module.exports = Express
