module.exports = {
  rollup(config) {
    config.external = (id) => {
      if (id !== 'axios' && id !== 'eth-rpc-errors') return false
      return true
    }
    // config.output.esModule = true
    return config
  },
}
