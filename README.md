
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
4. [**Deploy**](#4-deploy)
5. [**Configure**](#5-configure)
6. [**Develop**](#6-develop)
7. [**Monitor**](#7-monitor)
8. [**Remove**](#8-remove)

&nbsp;

### 1. Install

Install Serverless Components by specifying the `components` tag when installing the Serverless Framework.

```
$ npm install -g serverless@components
```


### 2. Login

Unlike most solutions, all component deployments run in the cloud. Therefore, you'll need to login to deploy, share and monitor your components.

```
$ serverless login
```

### 3. Create

You can easily create a new express instance just by using the following command and template url.

```
$ serverless create --template-url https://github.com/serverless/components/tree/cloud/templates/express
$ cd express
```

Then, create a new `.env` file in the root of the `express` directory right next to `serverless.yml`, and add your AWS access keys:

```
# .env
AWS_ACCESS_KEY_ID=XXX
AWS_SECRET_ACCESS_KEY=XXX
```

You should now have a directory that looks something like this:

```
|- src
  |- app.js
  |- package.json
|- serverless.yml  
|- .env
```
Just like any express app, don't forget to install the express dependencies:

```
$ cd src
$ npm install
$ cd ..
```

### 4. Deploy

Once you have the directory set up, you're now ready to deploy. Just run `serverless deploy` from within the directory containing the `serverless.yml` file. You should see output that looks like this:

```
$ serverless deploy

serverless ⚡ framework
Action: "deploy" - Stage: "dev" - App: "express-api" - Instance: "express-api"

url: https://usn0cmhx75.execute-api.us-east-1.amazonaws.com
domain: api.serverless.com

More instance info at https://dashboard.serverless.com/tenants/serverlessinc/applications/express-api/component/express-api/stage/dev/overview

6s › express-api › Success
```

Your first deployment might take a little while, but subsequent deployment would just take few seconds. For more information on what's going on during deployment, you could run specify the `serverless deploy --debug` flag, which would view deployment logs in realtime.


### 5. Configure

The Express component is a zero configuration component, meaning that it'll work out of the box with no configuration and sane defaults. For your customization, there's a lot of optional configuration that you can specify.

Here's a complete reference:

```yml
component: express              # name of the component. In that case, it's express.
name: myExpressApp              # name of your express component instance.
org: serverlessinc              # (optional) serverless dashboard org. default is the first org you created during signup.
app: myApp                      # (optional) serverless dashboard app. default is the same as the name property.
stage: dev                      # (optional) serverless dashboard stage. default is dev.



inputs:
  src: ./src                    # path to the source folder.
  memory: 512                   # (optional) memory size.
  timeout: 10                   # (optional) timeout.
  description: My Express App   # (optional) description.
  roleArn: arn:aws:abc          # (optional) custom role arn.
  env:                          # (optional) env vars.
    DEBUG: 'express:*'          #            this express specific env var will print express debug logs.
  domain: api.serverless.com    # (optional) domain name

```

Once you've chosen your configuration, run `serverless deploy` again (or simply just `serverless`) to deploy your changes.

### 6. Develop

Now that you've got your basic express app up and running, it's time to develop that into a real world application. Instead of having to run `serverless deploy` everytime you make changes you wanna test, you could enable dev mode on CLI.

Dev mode enables the CLI to watch for changes in your source directory as you develop and deploy instantly on save. It also enables live logs from your express app so that you can see the results of your tests right away on the CLI as they happen.

To enable dev mode, simply run `serverless dev` from within the directory containing the `serverless.yml` file:

```
$ serverless dev

serverless ⚡ framework
Dev Mode - Watching your Component for changes and enabling streaming logs, if supported...

9:37:30 PM - express-api - deployment
url: https://usn0cmhx75.execute-api.us-east-1.amazonaws.com

9:39:07 PM - express-api - transaction - GET - /
9:39:07 PM - express-api - log
hello world

express-api › Watching...
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
