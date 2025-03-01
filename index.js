const express = require('express')
const cors = require('cors')
const querystring = require('querystring')
const parseAlgoliaSQL = require('./src/parseAlgoliaSQL')
const { getIndex, existIndex } = require('./src/indexes')
const { getReplicas, strArrayToArray, wrapInQuotes } = require('./src/helpers')
const { v4 } = require('uuid')

const createServer = (options) => {
  const path = options.path || process.cwd()
  const replicas = getReplicas(options.replicas)
  const app = express()
  app.use(cors())

  app.use(express.json({ type: '*/*' }))

  app.get('/', (req, res) => {
    res.send('Welcome to Algolite')
  })

  /**
   * Algolia Index method(s):
   * index.search()
   */
  app.post('/1/indexes/:indexName/query', async (req, res) => {
    const { body, params: { indexName } } = req
    const { params: queryParams } = body
    const db = await getIndex(indexName, replicas, path)

    const { query, filters, facetFilters } = queryParams ? querystring.parse(queryParams) : body

    const searchExp = []
    if (query !== undefined) {
      searchExp.push(!query ? '*' : query)
    }

    if (filters) {
      const parsedFilters = strArrayToArray(facetFilters).map(n => wrapInQuotes(n))
      searchExp.push(parseAlgoliaSQL(db, parsedFilters))
    }

    if (facetFilters) {
      const parsedfacetFilters = strArrayToArray(facetFilters)
      searchExp.push(parseAlgoliaSQL(db, parsedfacetFilters.map(f => Array.isArray(f) ? `(${wrapInQuotes(f).join(' OR ')})` : wrapInQuotes(f)).join(' AND ')))
    }

    const { RESULT: results } = await db.QUERY({ SEARCH: searchExp }, { DOCUMENTS: true })

    const hits = results.map((item) => {
      const { _doc: obj } = item
      delete obj._id
      return obj
    })

    return res.json({
      hits,
      index: indexName,
      params: queryParams || '',
      query: query || ''
    })
  })

  /**
   * Agolia Search Multiple Indices
   */
  app.post('/1/indexes/*/queries', async (req, res) => {
    const { requests } = req.body

    const results = []
    for (const request of requests) {
      const { indexName, params } = request
      const db = await getIndex(indexName, replicas, path)

      const { query, facets, filters, facetFilters } = querystring.parse(params)

      const searchExp = []
      if (query) {
        searchExp.push(!query ? '*' : query)
      }

      if (filters) {
        const parsedFilters = strArrayToArray(facetFilters).map(n => wrapInQuotes(n))
        searchExp.push(parseAlgoliaSQL(db, parsedFilters))
      }

      if (facetFilters) {
        const parsedfacetFilters = strArrayToArray(facetFilters)
        searchExp.push(parseAlgoliaSQL(db, parsedfacetFilters.map(f => Array.isArray(f) ? `(${wrapInQuotes(f).join(' OR ')})` : wrapInQuotes(f)).join(' AND ')))
      }

      let docs = []
      if (searchExp.length === 0) {
        docs = await db.ALL_DOCUMENTS()
      } else {
        const response = await db.QUERY({ SEARCH: searchExp }, { DOCUMENTS: true })
        docs = response.RESULT
      }

      const hits = docs.map((item) => {
        const { _doc: obj } = item
        delete obj._id
        return obj
      })

      const facetsValues = {}
      const facetsParams = strArrayToArray(facets)
      if (facetsParams.length >= 1) {
        for (let i = 0; i < facetsParams.length; i++) {
          const facet = facetsParams[i]
          const docs = await db.FACETS({ FIELD: facet })
          const facetObject = {}
          docs && docs.forEach(d => {
            facetObject[[d.VALUE]] = d._id.length
          })

          if (Object.keys(facetObject).length >= 1) {
            facetsValues[[facet]] = facetObject
          }
        }
      }

      results.push({
        facets: facetsValues,
        hits,
        hitsPerPage: 96,
        index: indexName,
        nbHits: 10,
        nbPages: 1,
        page: 0,
        params: params || '',
        query: query || ''
      })
    }

    return res.json({ results })
  })

  /**
   * Algolia Index methods:
   * index.getObject()
   */
  app.get('/1/indexes/:indexName/:objectID', async (req, res) => {
    const { params: { indexName, objectID } } = req
    const db = await getIndex(indexName, replicas, path)
    const { RESULT: results } = await db.QUERY({ GET: `objectID:${objectID}` }, { DOCUMENTS: true })

    if (results.length === 0) {
      return res.status(404).json({
        message: 'ObjectID does not exist'
      })
    }

    const { _doc: obj } = results[0]
    delete obj._id

    return res.status(200).json({
      ...obj
    })
  })

  /**
   * Algolia Get Objects from Multiple Indices
   * index.getObjects()
   */
  app.post('/1/indexes/*/objects', async (req, res) => {
    const { requests } = req.body

    const results = []
    for (const request of requests) {
      const { indexName, objectID } = request
      const db = await getIndex(indexName, replicas, path)

      const { RESULT: docs } = await db.QUERY({ GET: `objectID:${objectID}` }, { DOCUMENTS: true })

      if (docs.length > 0) {
        const hits = docs.map((item) => {
          const { _doc: obj } = item
          delete obj._id
          return obj
        })

        results.push(...hits)
      }
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: 'ObjectIDs do not exist'
      })
    }

    return res.json({ results })
  })

  /**
   * Add object (without ID)
   */
  app.post('/1/indexes/:indexName', async (req, res) => {
    const { body, params: { indexName } } = req
    const _id = v4()

    const db = getIndex(indexName, replicas, path)
    await db.PUT([{
      _id,
      ...body
    }])

    return res.status(201).json({
      createdAt: (new Date()).toISOString(),
      taskID: 'algolite-task-id',
      objectID: _id
    })
  })

  /**
   * Algolia Index methods:
   * index.saveObject()
   * index.saveObjects()
   */
  app.post('/1/indexes/:indexName/batch', async (req, res) => {
    const { body, params: { indexName } } = req
    const puts = []
    const deletes = []

    for (const request of body.requests) {
      const _id = request.body.objectID
      switch (request.action) {
        case 'addObject':
          puts.push({ _id, ...request.body })
          break

        case 'updateObject':
        case 'partialUpdateObjectNoCreate':
          puts.push({ _id, ...request.body })
          break

        case 'deleteObject':
          deletes.push(_id)
          break

        default:
          // not supported
          return res.status(400).end()
      }
    }

    const db = await getIndex(indexName, replicas, path)
    if (puts.length) {
      await db.PUT(puts)
    }
    if (deletes.length) {
      await db.DELETE(deletes)
    }

    return res.status(201).json({
      objectIDs: body.requests.map(r => r.body.objectID)
    })
  })

  /**
   * Add/update object (with ID)
   */
  app.put('/1/indexes/:indexName/:objectID', async (req, res) => {
    const { body, params: { indexName } } = req
    const { objectID } = req.params

    const db = await getIndex(indexName, replicas, path)
    try {
      await db.DELETE([objectID])
    } catch (error) {
      if (!error.notFound) {
        return res.status(500).end()
      }
    }

    await db.PUT([{
      _id: objectID,
      ...body
    }])

    return res.status(201).json({
      updatedAt: (new Date()).toISOString(),
      taskID: 'algolite-task-id',
      objectID
    })
  })

  app.delete('/1/indexes/:indexName/:objectID', async (req, res) => {
    const { objectID, indexName } = req.params

    const db = await getIndex(indexName, replicas, path)
    try {
      await db.DELETE([objectID])
    } catch (error) {
      if (!error.notFound) {
        res.status(500).end()
      }
    }

    return res.status(200).json({
      deletedAt: (new Date()).toISOString(),
      taskID: 'algolite-task-id',
      objectID
    })
  })

  app.post('/1/indexes/:indexName/deleteByQuery', async (req, res) => {
    const { body, params: { indexName } } = req
    const { params: queryParams } = body

    const { facetFilters } = querystring.parse(queryParams)

    const db = await getIndex(indexName, replicas, path)

    const searchExp = []
    if (facetFilters) {
      searchExp.push(parseAlgoliaSQL(db, facetFilters))
    }

    if (searchExp.length === 0) {
      return res.status(400).json({
        message: 'DeleteByQuery endpoint only supports tagFilters, facetFilters, numericFilters and geoQuery condition',
        status: 400
      })
    }

    const result = await db.SEARCH(...searchExp)
    const ids = result.map(obj => obj._id)
    await db.INDEX.DELETE(ids)

    return res.status(201).json({
      updatedAt: (new Date()).toISOString(),
      taskID: 'algolite-task-id'
    })
  })

  app.post('/1/indexes/:indexName/clear', async (req, res) => {
    const { indexName } = req.params

    if (!existIndex(indexName, path)) {
      return res.status(400).end()
    }

    const db = await getIndex(indexName, replicas, path)
    await db.FLUSH()

    return res.status(200).json({
      taskID: 'algolite-task-id'
    })
  })

  return app
}

module.exports = createServer
