function getPromptModules() {
  return [
    'babel',
    'router',
  ].map(file => { return require(`../promptModule/${file}`) })
}

module.exports = {
  getPromptModules
}