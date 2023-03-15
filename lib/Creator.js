const inquirer = require('inquirer')
const { chalk, log, hasGit, hasProjectGit, execa, loadModule } = require('@vue/cli-shared-utils')
const { defaults, vuePresets } = require('./utils/preset')
const PromptModuleAPI = require('./PromptModuleAPI')
const { getPromptModules } = require('./utils/prompt')
const PackageManager = require('./PackageManager')
const { writeFileTree, sortObject, generateReadme } = require('./utils/util.js')
const Generator = require('./Generator')

class Creator {
  constructor(name, context) {
    // 构造函数初始化
    // 项目名称
    this.name = name;
    // 项目路径，包含名称
    this.context = process.env.VUE_CLI_CONTEXT = context;
    // package.json数据
    this.pkg = {};
    // 包管理工具
    this.pm = null
    // 预设提示选项
    this.presetPrompt = this.resolvePresetPrompts()
    // 自定义特性提示选项
    this.featurePrompt = this.resolveFeaturePrompts()
    // 保存相关提示选项
    this.outroPrompts = this.resolveOutroPrompt()
    // 其他提示选项
    this.injectedPrompts = []
    // 回调：自定义配置可能需要一些信息记录到对应的插件上
    this.promptCompleteCbs = []

    // 加载对应的模块
    const promptAPI = new PromptModuleAPI(this)
    const promptModules = getPromptModules()
    promptModules.forEach(m => m(promptAPI))

  }

  resolvePresetPrompts() {
    const presetChoices = Object.entries(defaults.presets).map(([name, preset]) => {
      return {
        name: `${name}(${Object.keys(preset.plugins).join(',')})`,
        value: name
      }
    })
    return {
      name: 'preset',
      type: 'list',
      message: 'Please pick a preset:',
      choices: [
        ...presetChoices,
        {
          name: 'Manual select features',
          value: '__manual__'
        }
      ]
    }
  }

  resolveFinalPrompts() {
    const prompts = [
      this.presetPrompt,
      this.featurePrompt,
      ...this.outroPrompts,
      ...this.injectedPrompts
    ]
    return prompts
  }

  resolveFeaturePrompts() {
    return {
      name: 'features',
      when: answers => answers.preset === '__manual__',
      type: 'checkbox',
      message: 'Check the features needed for your project:',
      pageSize: 10,
      choices: []
    }
  }

  resolveOutroPrompt() {
    const outroPrompts = [
      {
        name: 'useConfigFiles',
        when: answers => answers.preset === '__manual__',
        type: 'list',
        message: 'Where do you prefer placing config for Babel, ESlint, etc.?',
        choices: [
          {
            name: 'In dedicated config files',
            value: 'files'
          },
          {
            name: 'In package.json',
            value: 'pkg'
          }
        ]
      },
      {
        name: 'save',
        when: answers => answers.preset === '__manual__',
        type: 'confirm',
        message: 'Save this as a preset for feature projects?',
        default: false
      },
      {
        name: 'saveName',
        when: answers => answers.save,
        type: 'input',
        message: 'Save preset as:'
      }
    ]
    return outroPrompts
  }

  async promptAndResolvePreset() {
    try {
      let preset
      const { name } = this
      const answers = await inquirer.prompt(this.resolveFinalPrompts())
      if (answers.preset && answers.preset === 'Default (Vue 2)') {
        if (answers.preset in vuePresets) {
          preset = vuePresets[answers.preset]
        }
      } else {
        throw new Error('哎呀，出错了，暂时不支持 Vue3、自定义特性配置情况')
      }

      preset.plugins['@vue/cli-service'] = Object.assign({
        projectName: name
      }, preset)
      return preset
    } catch (error) {
      console.log(chalk.red(error))
      process.exit(1)
    }
  }

  async initPackageManagerEnv(preset) {
    const { name, context } = this
    this.pm = new PackageManager({ context })

    log(`✨ 创建项目：${chalk.yellow(context)}`)

    const pkg = {
      name,
      version: '0.1.0',
      private: true,
      devDependencies: {}
    }

    const deps = Object.keys(preset.plugins)
    deps.forEach(dep => {
      let { version } = preset.plugins[dep]
      if (!version) {
        version = 'latest'
      }
      pkg.devDependencies[dep] = version
    })

    this.pkg = pkg

    await writeFileTree(context, {
      'package.json': JSON.stringify(pkg, null, 2)
    })

    const shouldInitGit = this.shouldInitGit()
    if (shouldInitGit) {
      log(`🗃 初始化 Git 仓库...`)
      await this.run('git init')
    }

    log(`⚙ 正在安装 CLI plugins. 请稍候...`)
    await this.pm.install()
  }

  shouldInitGit() {
    if (!hasGit) {
      return false
    }

    return !hasProjectGit(this.context)
  }

  run(command, args) {
    if (!args) {
      [command, ...args] = command.split(/\s+/)
    }
    return execa(command, args, {
      cwd: this.context
    })
  }

  async generator(preset) {
    const { pkg, context } = this
    const plugins = await this.resolvePlugins(preset.plugins, pkg)
    const generator = new Generator(context, {
      pkg,
      plugins
    })
    await generator.generate({
      extractConfigFiles: preset.useConfigFiles
    })
    await this.pm.install()
    return generator
  }

  async resolvePlugins(rawPlugins) {
    rawPlugins = sortObject(rawPlugins, ['@vue/cli-service'], true)
    const plugins = []
    for (const id of Object.keys(rawPlugins)) {
      const apply = loadModule(`${id}/generator`, this.context) || (() => { })
      let options = rawPlugins[id] || {}
      plugins.push({ id, apply, options })
    }
    return plugins
  }

  async generateReadme(generator) {
    log('📄 正在生成 README.md...')
    const { context } = this
    await writeFileTree(context, {
      'README.md': generateReadme(generator.pkg)
    })
  }

  finished() {
    const { name } = this
    log('🎉 成功创建项目 ${chalk.yellow(name)}.')
    log(`👉 用以下命令启动项目 :\n\n` + chalk.cyan(`cd ${name}\n`) + chalk.cyan(`npm run serve`))
  }

  async create(cliOptions = {}) {
    // 处理用户输入
    const preset = await this.promptAndResolvePreset()
    // 初始化安装环境
    await this.initPackageManagerEnv(preset)
    // 生成项目文件，生成配置文件
    const generator = await this.generator(preset)
    // 生成readme文件
    this.generateReadme(generator)
    this.finished()
  }

}

module.exports = Creator