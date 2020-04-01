[![Serverless Components](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-components-3.gif)](http://serverless.com)

<br/>

**Serverless Express Component** ⎯⎯⎯ Rapidly deploy express applications on serverless infrastructure (AWS HTTP API and AWS Lambda) with zero configuration, powered by [Serverless Components](https://github.com/serverless/components/).

<br/>

- [x] **Never Pay For Idle** - No HTTP requests, no cost. Averages $0.0000002-$0.0000009 per request (depending on settings and compute time).
- [x] **Zero Configuration** - All we need is your code, then just deploy.
- [x] **Fast Deployments** - Deploy your entire express app in seconds.
- [x] **Canary Deployments** - Deploy your app gradually to a subset of your traffic overtime.
- [x] **Realtime Cloud Development** - Develop your express app directly on the cloud, with real time logs.
- [x] **Easy Custom Domain + SSL** - Deploy your entire express app in seconds.
- [x] **Team Collaboration** - Collaborate with your teamates with shared state and outputs.
- [x] **Built-in Monitoring** - Monitor your express app right from the Serverless Dashboard.

<br/>

<img src="/assets/deploy-demo.gif" height="250" align="right">

1. [**Install**](#1-install)
2. [**Create**](#2-create)
3. [**Deploy**](#3-deploy)
4. [**Configure**](#4-configure)
5. [**Develop**](#5-develop)
6. [**Monitor**](#6-monitor)
7. [**Remove**](#7-remove)

&nbsp;

### 1. Install

To get started with component, install the latest version of the Serverless Framework:

```
$ npm install -g serverless
```

### 2. Create

You can easily create a new express instance just by using the following command and template url.

```
$ serverless create --template-url https://github.com/serverless/components/tree/master/templates/express
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

Just like any express app, don't forget to install the express dependencies inside the `src` directory:

```
$ cd src
$ npm install
$ cd ..
```

### 3. Deploy

<img src="/assets/deploy-debug-demo.gif" height="250" align="right">

Once you have the directory set up, you're now ready to deploy. Just run `serverless deploy` from within the directory containing the `serverless.yml` file. Your first deployment might take a little while, but subsequent deployment would just take few seconds. After deployment is done, you should see your express app's URL. Visit that URL to see your new app live.

**Note:** If you see an `internal server error`, it probably means you did not run `npm install` after `serverless create`. See above for more info.

For more information on what's going on during deployment, you could specify the `serverless deploy --debug` flag, which would view deployment logs in realtime.

<br/>

### 4. Configure

The Express component is a zero configuration component, meaning that it'll work out of the box with no configuration and sane defaults. With that said, there are still a lot of optional configuration that you can specify.

Here's a complete reference of the `serverless.yml` file for the express component:

```yml
component: express               # (required) name of the component. In that case, it's express.
name: express-api                # (required) name of your express component instance.
org: serverlessinc               # (optional) serverless dashboard org. default is the first org you created during signup.
app: myApp                       # (optional) serverless dashboard app. default is the same as the name property.
stage: dev                       # (optional) serverless dashboard stage. default is dev.

inputs:
  src: ./src                     # (optional) path to the source folder. default is a hello world app.
  memory: 512                    # (optional) lambda memory size.
  timeout: 10                    # (optional) lambda timeout.
  description: My Express App    # (optional) lambda & api gateway description.
  env:                           # (optional) env vars.
    DEBUG: 'express:*'           #            this express specific env var will print express debug logs.
  roleArn: arn:aws:abc           # (optional) custom role arn.
  traffic: 0.2                   # (optional) traffic percentage to apply to this deployment.
  domain: api.serverless.com     # (optional) if the domain was registered via AWS Route53 on the account you are deploying to, it will automatically be set-up with your Express app's API Gateway, as well as a free AWS ACM SSL Cert.
  region: us-east-2              # (optional) aws region to deploy to. default is us-east-1.
```

Once you've chosen your configuration, run `serverless deploy` again (or simply just `serverless`) to deploy your changes.

### 5. Develop

<img src="/assets/dev-demo.gif" height="250" align="right">

Now that you've got your basic express app up and running, it's time to develop that into a real world application. Instead of having to run `serverless deploy` everytime you make changes you wanna test, you could enable dev mode, which allows the CLI to watch for changes in your source directory as you develop, and deploy instantly on save. 

Dev mode also enables live logs from your express app so that you can see the results of your tests right away on the CLI as they happen. To enable dev mode, simply run `serverless dev` from within the directory containing the `serverless.yml` file.

### 6. Monitor

<img src="/assets/info-demo.gif" height="250" align="right">

Anytime you need to know more about your running express instance, you can run `serverless info` to view the most critical info. This is especially helpful when you want to know the outputs of your instances so that you can reference them in another instance. You will also see a url where you'll be able to view more info about your instance on the Serverless Dashboard.

It also shows you the status of your instance, when it was last deployed, and how many times it was deployed. To digg even deeper, you can pass the `--debug` flag to view the state of your component instance in case the deployment failed for any reason. 

### 7. Remove

<img src="/assets/remove-demo.gif" height="250" align="right">

If you wanna tear down your entire express infrastructure that was created during deployment, just run `serverless remove` in the directory containing the `serverless.yml` file. The express component will then use all the data it needs from the built-in state storage system to delete only the relavent cloud resources that it created.

Just like deployment, you could also specify a `--debug` flag for realtime logs from the express component running in the cloud.

## Architecture

- [x] **AWS HTTP API** - The API Gateway which receives all requests and proxies them to AWS Lambda.
- [x] **AWS Lambda** - A single AWS Lambda function runs your Express.js application.
- [x] **AWS IAM** - An AWS IAM role is automatically created, if you do not provide a custom one.
- [x] **AWS Route53** - If you enter a `domain` input and the domain already exists on your AWS account, a Route53 hosted zone will be created and integrated into your API Gateway.
- [x] **AWS ACM SSL Certificate** - If you enter a `domain` input and the domain already exists on your AWS account, a free AWS ACM SSL certificate will be created.
