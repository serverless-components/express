const os = require('os')
const path = require('path')
const tar = require('tar')
const globby = require('globby')

async function sleep(wait) {
  return new Promise((resolve) => setTimeout(() => resolve(), wait))
}

async function tgz(srcPath, fileName) {
  const files = (await globby('**', { cwd: srcPath })).sort()
  const destPath = os.tmpdir()

  const file = path.join(destPath, fileName)
  await tar.c(
    {
      gzip: true,
      cwd: srcPath,
      file
    },
    files
  )
  return { destPath, filePath: file }
}

module.exports = { tgz, sleep }
