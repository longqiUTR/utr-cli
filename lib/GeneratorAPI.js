const { getPluginLink, toShortPluginId, matchesPluginId } = require('@vue/cli-shared-utils')
const path = require('path')
const { extractCallDir, mergeDeps, isObject } = require('./utils/util')
const fs = require('fs')
const ejs = require('ejs')
const { isBinaryFileSync } = require('isbinaryfile')

class GeneratorAPI {
  constructor(id, generator, options, rootOptions) {
    this.id = id
    this.generator = generator
    this.options = options
    this.rootOptions = rootOptions

    this.pluginsData = generator.plugins
      .filter(({ id }) => id !== '@vue/cli-service')
      .map(({ id }) => (
        {
          name: toShortPluginId(id),
          link: getPluginLink(id)
        }
      ))

    this._entryFile = undefined
  }

  render(source, additionalData = {}) {
    const baseDir = extractCallDir()
    if (typeof source === 'string') {
      source = path.resolve(baseDir, source)
      this._injectFileMiddleware(async files => {
        const data = this._resolveData(additionalData)
        const globby = require('globby')
        const _files = await globby(['**/*'], { cwd: source, dot: true })

        for (const rawPath of _files) {
          // 生成文件时，_ 换成 .   __直接删掉
          const targetPath = rawPath.split('/').map(filename => {
            if (filename.charAt(0) === '_' && filename.charAt(1) !== '_') {
              return `.${filename.slice(1)}`
            }
            if (filename.charAt(0) === '_' && filename.charAt(1) === '_') {
              return filename.slice(1)
            }
            return filename
          }).join('/')

          const sourcePath = path.resolve(source, rawPath)
          const content = this.readFile(sourcePath, data)
          if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
            files[targetPath] = content
          }
        }
      })
    }
  }

  _injectFileMiddleware(middleware) {
    this.generator.fileMiddlewares.push(middleware)
  }

  _resolveData(additionalData) {
    return Object.assign({
      options: this.options,
      rootOptions: this.rootOptions,
      plugins: this.pluginsData
    }, additionalData)
  }

  readFile(name, data) {
    if (isBinaryFileSync(name)) {
      return fs.readFileSync(name)
    }

    const template = fs.readFileSync(name, 'utf-8')
    return ejs.render(template, data)
  }

  extendPackage(fields, options = {}) {
    const pkg = this.generator.pkg
    const toMerge = fields

    for (const key in toMerge) {
      const value = toMerge[key]
      const existing = pkg[key]
      if (isObject(value) && isObject(existing)) {
        pkg[key] = mergeDeps(existing || {}, value)
      } else {
        pkg[key] = value
      }
    }
  }

  hasPlugin(id) {
    const pluginExists = [
      ...this.generator.plugins.map(p => p.id)
    ].some(pid => matchesPluginId(id, pid))
    return pluginExists
  }
}

module.exports = GeneratorAPI