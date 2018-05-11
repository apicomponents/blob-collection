const S3Store = require('./S3Store')
const DatePartition = require('./DatePartition');
const ObjectID = require('bson-objectid')
const lruCache = require('lru-cache')
const takeWhile = require('lodash.takewhile')
const takeRight = require('lodash.takeright')

function isoDate(date) {
  return date.toISOString().substr(0, 10)
}

DEFAULT_VIEW = {
  version: 'default',
  map: doc => ({}),
  filter: undefined // same effect as ({}) => true
}

class BlobCollection {
  get client() { return this.store.client }
  get bucket() { return this.store.bucket }
  get prefix() { return this.store.prefix }

  constructor({client, bucket, prefix, view}) {
    this.store = new S3Store({client, bucket, prefix})
    this.view = Object.assign({}, DEFAULT_VIEW, (view || {}))

    this.currentDatePartitions = {}
    this.datePartitionCache = lruCache({max: 10})
    this.viewCache = lruCache({max: 500})
  }

  async list(before = null, limit = 100) {
    let date, cutoff
    if (before) {
      date = ObjectID(before).getTimestamp()
      cutoff = before
    } else {
      date = new Date(Date.now() + 10 * 60 * 1000)
      cutoff = ObjectID(Math.floor(date / 1000)).toString()
    }

    const datePartition = this.getDatePartition(date)
    let ids = await datePartition.listKeys()
    ids = takeWhile(ids, ([id, etag]) => id < cutoff)

    let docs = takeRight(ids, limit).map(([id, etag]) => {
      const viewData = this.viewCache.get(
        [id, etag, this.view.version].join(',')
      )
      return Object.assign({}, viewData, {_id: id, _etag: etag})
    })
    if (this.view.filter) {
      // TODO: if this reduces the number of docs below the limit,
      // add some that were removed because of the limit
      docs = docs.filter(doc => this.view.filter(doc))
    }
    return docs
  }

  getDatePartition(date) {
    const dateString = isoDate(date)
    if (this.currentDatePartitions[dateString]) {
      return this.currentDatePartitions[dateString]
    } else {
      this.currentDatePartitions[dateString] =
        new DatePartition({store: this.store, date})
      return this.currentDatePartitions[dateString]
    }
  }

  async get(id, etag = undefined) {
    const key = this.keyForDocument(id)
    const response = await this.client.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise()
    return JSON.parse(response.Body.toString('utf8'))
  }

  async put(doc) {
    const docWithId = this.constructor.ensureStringId(doc)
    const key = this.keyForDocument(docWithId._id)
    const result = await this.client.putObject({
      Body: JSON.stringify(docWithId),
      ContentType: 'application/json',
      Bucket: this.bucket,
      Key: key
    }).promise()
    // TODO: pass updated date to view function
    this.viewCache.set(
      [docWithId._id, result.ETag, this.view.version].join(','),
      this.view.map(docWithId, {})
    )
    return { _id: docWithId._id }
  }

  keyForDocument(id) {
    const date = ObjectID(id).getTimestamp()
    return `${this.prefix}${isoDate(date)}/${id}.json`
  }

  static ensureStringId(doc) {
    if (doc._id === undefined) {
      return Object.assign({}, doc, {_id: ObjectID().toString()})
    } else if (typeof doc._id === 'string' && doc._id.length === 24) {
      return doc
    } else {
      let id = doc._id.toString()
      if (id.length !== 24) {
        id = ObjectID().toString()
      }
      return Object.assign({}, doc, {_id: id})
    }
  }
}

module.exports = BlobCollection
