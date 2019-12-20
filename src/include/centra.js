const CentraRequest = require('./CentraRequest.js')

module.exports = (url, method) => {
  return new CentraRequest(url, method)
}
