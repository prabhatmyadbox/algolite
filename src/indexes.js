
const si = require('search-index')
const path = require('path')
const fs = require('fs')
const level = require('level')

const indexes = {}

const getIndexName = (indexName, replicas = {}) => {
  return replicas[indexName] || indexName
}

module.exports.getIndex = async (indexName, replicas, storePath) => {
  const _indexName = getIndexName(indexName, replicas)
  const index = indexes[_indexName]

  const basePath = path.join(storePath, '.algolite')
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath)
  }

  if (!index) {
    indexes[_indexName] = await si({
      db: level(path.join(basePath, _indexName), { valueEncoding: 'json' })
    })
  }

  return indexes[_indexName]
}

module.exports.existIndex = (indexName, storePath) => {
  const _indexName = getIndexName(indexName)
  const basePath = path.join(storePath, '.algolite', _indexName)

  return fs.existsSync(basePath)
}
