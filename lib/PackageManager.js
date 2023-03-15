const { semver, execa } = require('@vue/cli-shared-utils')
const { executeCommand } = require('./utils/executeCommand')

const PACKAGE_MANAGER_CONFIG = {
  npm: {
    install: ['install', '--loglevel', 'error']
  }
}

class PackageManager {
  constructor({ context } = {}) {
    this.context = context || process.cwd()
    this.bin = 'npm'
    this._registries = {}

    const MIN_SUPPORTED_NPM_VERSION = '6.9.0'
    const npmVersion = execa.sync('npm', ['--version']).stdout
    // semver.lt: ＜
    if (semver.lt(npmVersion, MIN_SUPPORTED_NPM_VERSION)) {
      throw new Error('NPM 版本太低啦，请升级')
    }
    // semver.gte: ≥
    if (semver.gte(npmVersion, '7.0.0')) {
      this.needsPeerDepsFix = true
    }
  }

  async install() {
    const args = []

    if (this.needsPeerDepsFix) {
      args.push('--legacy-peer-deps')
    }

    return await this.runCommand('install', args)
  }

  async runCommand(command, args) {
    await executeCommand(
      this.bin,
      [
        ...PACKAGE_MANAGER_CONFIG[this.bin][command],
        ...(args || [])
      ],
      this.context
    )
  }
}

module.exports = PackageManager