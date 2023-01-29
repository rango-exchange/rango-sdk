const replace = require('@rollup/plugin-replace')

module.exports = {
  rollup(config, opts) {
    // https://github.com/jaredpalmer/tsdx/issues/179#issuecomment-525306272
    config.external = (id) => {
      if (id !== 'axios' && id !== 'eth-rpc-errors') return false
      return true
    }
    // https://github.com/jaredpalmer/tsdx/issues/981#issuecomment-789920054
    config.plugins = config.plugins.map((p) =>
      p.name === 'replace'
        ? replace({
            'process.env.NODE_ENV': JSON.stringify(opts.env),
            preventAssignment: true,
          })
        : p
    )
    // config.output.esModule = true
    return config
  },
}
