// if lambda instance is already warm, the following has already been set
// in the previous invocation. Removing this check causes logs to double
// because we would be adding to the previous ovewrite
if (!process.warm) {
  const forceSync = require('./sync-rpc')
  const streamLog = forceSync(require.resolve('./streamLog'))
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)

  process.stdout.write = (chunk, encoding, callback) => {
    streamLog(chunk)
    return originalStdoutWrite(chunk, encoding, callback)
  }

  process.stderr.write = (chunk, encoding, callback) => {
    streamLog(chunk)
    return originalStderrWrite(chunk, encoding, callback)
  }

  console.log = (msg) => process.stdout.write(`${msg}\n`) // eslint-disable-line
  console.debug = (msg) => process.stdout.write(`${msg}\n`) // eslint-disable-line
  console.error = (msg) => process.stderr.write(`${msg}\n`) // eslint-disable-line

  // make sure subsequent lambda invocations don't double the overwrite
  process.warm = true
}
