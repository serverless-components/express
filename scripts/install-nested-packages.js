#!/usr/bin/env node

'use strict';

process.on('unhandledRejection', (reason) => {
  throw reason;
});

const path = require('path');
const childProcess = require('child_process');

const platformRoot = path.resolve(__dirname, '..');

const npmInstall = (packagePath) =>
  new Promise((resolve, reject) => {
    console.log('---------------------------------------');
    console.log(`Install \x1b[33m${packagePath}\x1b[39m ...\n`);
    const child = childProcess.spawn('npm', ['install'], {
      cwd: path.resolve(platformRoot, packagePath),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) {
        reject(new Error(`npm install failed at ${packagePath}`));
      } else {
        resolve();
      }
    });
  });

const packagesPaths = ['src', 'src/_express', 'src/_src', 'test/src'];

(async () => {
  // Running multiple "npm install" prcesses in parallel is not confirmed to be safe.
  for (const packagePath of packagesPaths) {
    await npmInstall(packagePath);
  }
})();
