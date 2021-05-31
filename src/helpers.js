const fs = require('fs')

const getReplicas = (path) => {
  if (!fs.existsSync(path)) {
    return {}
  }

  const rawData = fs.readFileSync(path)
  return JSON.parse(rawData)
}

module.exports = {
  getReplicas
}
