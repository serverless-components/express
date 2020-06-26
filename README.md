[![Serverless Components](https://s3.amazonaws.com/public.assets.serverless.com/images/readme_serverless_express.gif)](http://serverless.com)

<br/>

**Serverless Express** ⎯⎯⎯ This [Serverless Framework Component](https://github.com/serverless/components) enables you to take existing Express.js apps and deploy them onto cheap, auto-scaling, serverless infrastructure on AWS (specifically AWS HTTP API and AWS Lambda), easily.  It's packed with production-ready features, like custom domains, SSL certificates, canary deployments, and costs an average of **$0.000003** per request.

<br/>

- [x] **Never Pay For Idle** - No HTTP requests, no cost. Averages ~$0.000003 per request.
- [x] **Zero Configuration** - All we need is your code, then just deploy (advanced config options are available).
- [x] **Fast Deployments** - Deploy changes to the cloud in seconds.
- [x] **Realtime Logging** - Rapidly develop on the cloud w/ real-time logs and errors in the CLI.
- [x] **Canary Deployments** - Deploy your app gradually to a subset of your traffic overtime.
- [x] **Custom Domain + SSL** - Auto-configure a custom domain w/ a free AWS ACM SSL certificate.
- [x] **Team Collaboration** - Collaborate with your teamates with shared state and outputs.
- [x] **Built-in Monitoring** - Monitor your express app right from the Serverless Dashboard.
- [x] **Auto-Generates An OpenAPI Spec** - A new OpenAPI spec is generated after each deployment.

<br/>

Check out the **[Serverless Fullstack Application](https://github.com/serverless-components/fullstack-app)** for a ready-to-use boilerplate and overall great example of how to use this Component.

<br/>

<img src="/assets/deploy-demo.gif" height="250" align="right">

Get Started:

1. [**Install**](#1-install)
2. [**Create**](#2-create)
3. [**Deploy**](#3-deploy)
4. [**Configure**](#4-configure)
5. [**Dev Mode**](#5-dev-mode)
6. [**Monitor**](#6-monitor)
7. [**Remove**](#7-remove)

Extra:

* [**Architecture**](#Architecture)
* [**Guides**](#Guides)

&nbsp;

### Install

To get started with this component, install the latest version of the Serverless Framework:

```
$ npm install -g serverless
```

### Create

You can easily create a new express instance just by using the following command and template url.

```
$ serverless create --template-url https://github.com/serverless/components/tree/master/templates/express
$ cd express
```

Just like any express app, don't forget to install the express dependencies:

```
$ npm install
```

Then, create a new `.env` file in the root of the `express` directory right next to `serverless.yml`, and add your AWS access keys:

```
# .env
AWS_ACCESS_KEY_ID=XXX
AWS_SECRET_ACCESS_KEY=XXX
```

You should now have a directory that looks something like this:

```
|- app.js
|- node_modules
|- package.json
|- serverless.yml
|- .env
```

### Deploy

<img src="/assets/deploy-debug-demo.gif" height="250" align="right">

Once you have the directory set up, you're now ready to deploy. Just run `serverless deploy` from within the directory containing the `serverless.yml` file. Your first deployment might take a little while, but subsequent deployment would just take few seconds. After deployment is done, you should see your express app's URL. Visit that URL to see your new app live.

**Note:** If you see an `internal server error`, it probably means you did not run `npm install` after `serverless create`. See above for more info.

For more information on what's going on during deployment, you could specify the `serverless deploy --debug` flag, which would view deployment logs in realtime.

<br/>

### Configure

The Express component is a zero configuration component, meaning that it'll work out of the box with no configuration and sane defaults. With that said, there are still a lot of optional configuration that you can specify.

Here's a complete reference of the `serverless.yml` file for the express component:

```yml
component: express               # (required) name of the component. In that case, it's express.  You will want to pin this to a specific version in production via semantic versioning, like this: express@1.0.10.  Run 'serverless registry express' to see available versions.
name: express-api                # (required) name of your express component instance.
org: serverlessinc               # (optional) serverless dashboard org. default is the first org you created during signup.
app: myApp                       # (optional) serverless dashboard app. default is the same as the name property.
stage: dev                       # (optional) serverless dashboard stage. default is dev.

inputs:
  src: ./                        # (optional) path to the source folder. default is a hello world app.
  memory: 512                    # (optional) lambda memory size.
  timeout: 10                    # (optional) lambda timeout.
  description: My Express App    # (optional) lambda & api gateway description.
  env:                           # (optional) env vars.
    DEBUG: 'express:*'           #            this express specific env var will print express debug logs.
  roleName: my-custom-role-name  # (optional) custom AWS IAM Role name for setting custom permissions.
  traffic: 0.2                   # (optional) traffic percentage to apply to this deployment.
  layers:                        # (optional) list of lambda layer arns to attach to your lambda function.
    - arn:aws:first:layer
    - arn:aws:second:layer
  domain: api.serverless.com     # (optional) if the domain was registered via AWS Route53 on the account you are deploying to, it will automatically be set-up with your Express app's API Gateway, as well as a free AWS ACM SSL Cert.
  region: us-east-2              # (optional) aws region to deploy to. default is us-east-1.
  inference: true                # (optional) (experimental) Initialize the express app on each deployment, extract an OpenAPI V.3 specification, and add it to he outputs.
```

Once you've chosen your configuration, run `serverless deploy` again (or simply just `serverless`) to deploy your changes.

### Dev Mode

<img src="/assets/dev-demo.gif" height="250" align="right">

Now that you've got your basic express app up and running, it's time to develop that into a real world application. Instead of having to run `serverless deploy` everytime you make changes you wanna test, run `serverless dev`, which allows the CLI to watch for changes in your source directory as you develop, and deploy instantly on save. 

To enable dev mode, simply run `serverless dev` from within the directory containing the `serverless.yml` file.

Dev mode also enables live streaming logs from your express app so that you can see the results of your code changes right away on the CLI as they happen.

### Monitor

<img src="/assets/info-demo.gif" height="250" align="right">

Anytime you need to know more about your running express instance, you can run `serverless info` to view the most critical info. This is especially helpful when you want to know the outputs of your instances so that you can reference them in another instance. You will also see a url where you'll be able to view more info about your instance on the Serverless Dashboard.

It also shows you the status of your instance, when it was last deployed, and how many times it was deployed. To dig even deeper, you can pass the `--debug` flag to view the state of your component instance in case the deployment failed for any reason. 

### Remove

<img src="/assets/remove-demo.gif" height="250" align="right">

If you wanna tear down your entire express infrastructure that was created during deployment, just run `serverless remove` in the directory containing the `serverless.yml` file. The express component will then use all the data it needs from the built-in state storage system to delete only the relavent cloud resources that it created.

Just like deployment, you could also specify a `--debug` flag for realtime logs from the express component running in the cloud.

## Architecture

This is the AWS serverless infrastructure that is created by this Component:

- [x] **AWS HTTP API** - The API Gateway which receives all requests and proxies them to AWS Lambda.
- [x] **AWS Lambda** - A single AWS Lambda function runs your Express.js application.
- [x] **AWS IAM** - An AWS IAM role is automatically created, if you do not provide a custom one.
- [x] **AWS Route53** - If you enter a `domain` input and the domain already exists on your AWS account, a Route53 hosted zone will be created and integrated into your API Gateway.
- [x] **AWS ACM SSL Certificate** - If you enter a `domain` input and the domain already exists on your AWS account, a free AWS ACM SSL certificate will be created.

# Guides

### Setting Up A Custom Domain & SSL Certificate

The Express Component can easily set up a custom domain and free SSL certificate for you.

First, register your custom domain via Route53 on the AWS Acccount you are deploying to.

Next, add the domain to the `domain` in `inputs` in `serverless.yml`, like this:

```yaml

inputs:
  src: ./
  domain: serverlessexpress.com

```

You can also use a subdomain:

```yaml

inputs:
  src: ./
  domain: express.component-demos.com

```

Run `serverless deploy`.

Keep in mind, it will take AWS CloudFront and AWS Route53 and DNS up to 24 hours to propagate these changes and make your custom domain globally accessible.  However, with recent AWS CloudFront speed increases, your domain should be accessible within ~20 minutes.

#### Setting up domains registered outside of AWS

If your domain is not on AWS Route53, you will have to set this up manually because the component does not have access to your registrar. Here are the general steps involved:

1. Create an AWS ACM certificate for your domain. Make sure you set the "Additional Names" field to `*.yourdomain.com` as well to include all subdomains as well.
2. After you create the certificate, it should be in a `PENDING_VALIDATION` status. Now you will need to validate your domain. We suggest you follow the DNS steps by adding the validation CNAME record you see on the AWS console to your domain via your registrar dashboard.
3. After you add the validation record, it might take a while, but eventually the certificate should change status to `ISSUED`. Usually it takes around 5 minutes.
4. Add your domain to the `serverless.yml` file as shown above and deploy. This step is important as it adds your domain to API Gateway.
5. Notice the regional url that is returned as an output. Copy this URL, get back to your registrar and add another CNAME record with your domain or subdomain name and a value of this regional url. This ensures that your domain points to that cloudfront URL.
6. After around 20 mins, your SSL certificate and domain should all be working and pointing to your URL. Keep in mind that if you change the `name`, `stage`, `app` or `org` properties in `serverless.yml`, this would result in a completely new instance with a new cloudfront url. This allows you to setup different domains for each stage or instance


### Canary Deployments

At scale, when you want to push changes out to a small set of users, Serverless Express offers easy Canary Deployments out of the box!

This enables you to push out a version of your app (containing code changes you deem risky) which is only served to a percentage of traffic that you specificy (0-99%).  This allows you to test big changes with little risk.

To perform a canary deployment, first update your code with the potentially risky change.  

Next, set a traffic weighting in your `serverless.yml` `inputs`:

```yaml

inputs:
  src: ./
  traffic: 0.5 # 50%

```

This tells Serverless Express to serve the new (potentially risky) code to 50% of the API requests, and the old (stable) code to the other 50% of requests.

Run `serverless deploy`.  After deployment is complete, 50% of your requests will be randomly handled by the new experimental code.

You can slowly increment the percentage over time, just continue to re-deploy it.

If things aren't working, revert your code to the old code, remove the `traffic` configuration option, and deploy.

If things are working, keep the new code, remove the `traffic` configuration option, and deploy.

### Auto-Generate An OpenAPI V3 Specification From Your Express.js App

Version 1.1.0 introduced experimental support for a new feature called *"Inference"*.

Inference attempts to run your application on each deployment and extract information from it.

The first feature Inference enables is detecting your API routes and converting them to the OpenAPI format, then adding them to the `outputs` of your Component Instance.

Currently, Inference is disabled by default.  To enable it, add `inference: true` to your `serverless.yml` and ensure you are using the latest version of the Express coponent (>= 1.1.0).

Given a lot of things can happen in your application upon starting it up, Inference does not work consistently.  If it runs into an error trying to start your application, it will try its best to pass through useful errors to you so you can address what's blocking it from working.

Overall, an OpenAPI specification generated by default is very powerful.  This means you don't have to maintain that manually since it auto-updates on every deployment.  (That's what serverless is all about!)

We will be adding many interesting features built on this.  Extracting your endpoints and putting them into a common format was merely hte first step...