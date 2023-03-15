const { writeFileTree, sortObject } = require('./utils/util')
const PackageManager = require('./PackageManager')
const ConfigTransform = require('./ConfigTransform')
const GeneratorAPI = require('./GeneratorAPI')

class Generator {
  constructor(context, {
    pkg = {},
    plugins = [],
    files = {}
  } = {}) {
    this.context = context
    this.plugins = plugins
    this.originalPkg = pkg
    this.pkg = Object.assign({}, pkg)
    this.pm = new PackageManager({ context })
    this.rootOptions = {}
    this.defaultConfigTransforms = defaultConfigTransforms
    this.files = files
    this.fileMiddlewares = []
    this.exitLogs = []

    const cliService = plugins.find(p => p.id === '@vue/cli-service')
    const rootOptions = cliService ? cliService.options : inferRootOptions(pkg)

    this.rootOptions = rootOptions
  }

  async generate({
    extractConfigFiles = false,
    checkExisting = false,
    sortPackageJson = false
  } = {}) {
    await this.initPlugins()
    this.extractConfigFiles(extractConfigFiles, checkExisting)
    await this.resolveFiles()
    if (sortPackageJson) {
      this.sortPkg()
    }
    this.files['package.json'] = JSON.stringify(this.pkg, null, 2) + '\n'
    await writeFileTree(this.context, this.files)
  }

  async initPlugins() {
    const { rootOptions } = this
    for (const plugin of this.plugins) {
      const { id, apply, options } = plugin
      const api = new GeneratorAPI(id, this, options, rootOptions)
      await apply(api, options, rootOptions, {})
    }
  }

  extractConfigFiles() {
    const ensureEOL = str => {
      if (str.charAt(str.length - 1) !== '\n') {
        return str + '\n'
      }
      return str
    }
    const extract = key => {
      const value = this.pkg[key]
      const configTransform = this.defaultConfigTransforms[key]
      const res = configTransform.transform(
        value,
        false,
        this.files,
        this.context
      )
      const { content, filename } = res
      this.files[filename] = ensureEOL(content)
    }

    extract('vue')
    extract('babel')
  }

  async resolveFiles() {
    for (const middleware of this.fileMiddlewares) {
      await middleware(this.files)
    }
  }

  sortPkg() {
    this.pkg.dependencies = sortObject(this.pkg.dependencies)
    this.pkg.devDependencies = sortObject(this.pkg.devDependencies)

    this.pkg.script = sortObject(this.pkg.script, [
      'serve',
      'build',
      'test:lint',
      'test:e2e',
      'lint',
      'deploy'
    ])
    this.pkg = sortObject(this.pkg, [
      'name',
      'version',
      'private',
      'description',
      'author',
      'scripts',
      'main',
      'module',
      'browser',
      'jsDelivr',
      'unpkg',
      'files',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'vue',
      'babel',
      'eslintConfig',
      'prettier',
      'postcss',
      'browserslist',
      'jest'
    ])
  }

}
const defaultConfigTransforms = {
  vue: new ConfigTransform({
    js: ['vue.config.js']
  }),
  babel: new ConfigTransform({
    js: ['babel.config.js']
  }),
  postcss: new ConfigTransform({
    js: ['postcss.config.js']
  }),
  eslintConfig: new ConfigTransform({
    js: ['.eslintrc.js']
  }),
  jest: new ConfigTransform({
    js: ['jest.config.js']
  }),
  'lint-staged': new ConfigTransform({
    js: ['lint-staged.config.js']
  })
}

module.exports = Generator