const fs = require('fs')

const getReplicas = (path) => {
  if (!fs.existsSync(path)) {
    return {}
  }

  const rawData = fs.readFileSync(path)
  return JSON.parse(rawData)
}

const strArrayToArray = (value) => value.replace(/[\[\]'"]+/g, '').split(',')
const wrapInQuotes = (token) => {
  const [key, value] = token.split(':')
  const newValue = `"${value.replace(/"'/g, '')}"`
  const newToken = [key, newValue].join(':')
  return newToken
}

module.exports = {
  getReplicas,
  strArrayToArray,
  wrapInQuotes
}
