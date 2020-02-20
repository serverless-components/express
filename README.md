
[![Serverless Components](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-components-3.gif)](http://serverless.com)

<br/>

**Serverless Express Component** ⎯⎯⎯ Rapidly deploy express applications on serverless infrastructure with zero configuration, powered by [Serverless Components](https://github.com/serverless/components/tree/cloud).

<br/>

- [x] **Zero Configuration** - Just let us know where your code is, then deploy.
- [x] **Fast Deployments** - Deploy your entire express app in seconds.
- [x] **Realtime Cloud Development** - Develop your express app directly on the cloud, with real time logs.
- [x] **Team Collaboration** - Collaborate with your teamates with shared state and outputs.
- [x] **Built-in Monitoring** - Monitor your express app right from the Serverless Dashboard.

<br/>

<img src="/assets/demo.gif" height="250" align="right">

1. [**Install**](#1-install)
2. [**Login**](#2-login)
3. [**Create**](#3-create)
4. [**Configure**](#4-configure)
5. [**Deploy**](#5-deploy)
6. [**Develop**](#6-develop)
7. [**Manage**](#7-manage)
8. [**Remove**](#8-remove)

&nbsp;

### 1. Install

```shell
$ npm install -g serverless@components
```


### 2. Login

```
$ serverless login
```

### 3. Create

```
$ mkdir my-app
$ cd my-app
```

the directory should look something like this:

```
|- src
  |- app.js        # express app
  |- package.json  # holds express as a dependency
|- serverless.yml  
|- .env            # your AWS api keys

```

```
# .env
AWS_ACCESS_KEY_ID=XXX
AWS_SECRET_ACCESS_KEY=XXX
```

```js
// app.js
const express = require('express')
const app = express()

app.get('/*', function(req, res) {
  console.log('hello world')

  res.send('hello world')
})

module.exports = app
```

### 4. Configure

```yml
org: serverlessinc
app: myApp
component: express
name: myExpressApp
stage: dev

inputs:
  src: ./src                    # path to the source folder
  memory: 512                   # (optional) memory size
  timeout: 10                   # (optional) timeout
  description: My Express App   # (optional) description
  roleArn: arn:aws:abc          # (optional) custom role arn
  env:                          # (optional) env vars
    DEBUG: 'express:router:*'
  domain: api.serverless.com    # (optional) domain name

```

### 5. Deploy

```
$ serverless deploy

serverless ⚡ framework
Action: "deploy" - Stage: "dev" - App: "myApp" - Instance: "myExpressApp"

url: https://usn0cmhx75.execute-api.us-east-1.amazonaws.com
domain: api.serverless.com

More instance info at https://dashboard.serverless.com/tenants/serverlessinc/applications/myApp/component/myExpressApp/stage/dev/overview

6s › myExpressApp › Success
```

### 6. Develop
You can enable dev mode to watch for changes in your source directory and enable live logs from your express app:

```
$ serverless dev

serverless ⚡ framework
Dev Mode - Watching your Component for changes and enabling streaming logs, if supported...

9:37:30 PM - myExpressApp - deployment
url: https://usn0cmhx75.execute-api.us-east-1.amazonaws.com

9:39:07 PM - myExpressApp - transaction - GET - /
9:39:07 PM - myExpressApp - log
hello world

myExpressApp › Watching...
```

### 7. Manage

```
$ serverless info

serverless ⚡ framework

Status:       active
Last Action:  deploy (3 minutes ago)
Deployments:  4
More Info:    https://dashboard.serverless.com/tenants/serverlessinc/applications/myApp/component/myExpressApp/stage/dev/overview

url: https://usn0cmhx75.execute-api.us-east-1.amazonaws.com
domain: api.serverless.com

myExpressApp › Success
```

### 8. Remove

```
$ serverless remove

serverless ⚡ framework
Action: "remove" - Stage: "dev" - App: "myApp" - Instance: "myExpressApp"

5s › myExpressApp › Success
```

&nbsp;

### New to Components?

Checkout the [Serverless Components](https://github.com/serverless/components) repo for more information.
