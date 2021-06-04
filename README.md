# Algolite
An Implementation of [Algolia](https://www.algolia.com/) to emulate its REST API on your local machine or CI environments in order to speed up your development and testing cycles.

## Installation

```
npm run -g algolite
```

## Example

```
$ algolite --help

Usage: algolite [--port <port>] [--path <path>]

An Algolia REST API Implementation

Options:
--help                Display this help message and exit
--port <port>         The port to listen on (default: 9200)
--path <path>         The path to use for the LevelDB store (Your project folder)
--replicas <path>     The path to JSON file containing the index replicas map
```

Once running any algolia client can be used.

```javascript

const client = algoliasearch('app-id', 'api-key', {
  hosts: [{
    protocol: 'http',
    url: 'localhost:9200'
  }]
})

const index = client.initIndex('entries');

await index.addObject({
  title: 'Algolia 2019',
  contentType: 'events'
})

const result = await index.search('Algolia')
```

### Replica map JSON structure

```javascript

{
  "index_replica_name_1": "index_name",
  "index_replica_name_2": "index_name"
}

```

## Docker Image

```
docker run --rm -p 9200:9200 --name algolite marconi1992/algolite:0.1.1
```
