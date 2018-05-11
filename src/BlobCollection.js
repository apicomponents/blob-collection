//@flow
const S3Store = require('./S3Store')
const DatePartition = require('./DatePartition');
const ObjectID = require('bson-objectid')
const takeWhile = require('lodash.takewhile')
const takeRight = require('lodash.takeright')
const lruCache = require('lru-cache')

function isoDate(date: any) {
  return date.toISOString().substr(0, 10)
}

type View = {
  version: string,
  map: ({}, {}) => {},
  filter: {} => boolean
}

const DEFAULT_VIEW = {
  version: 'default',
  map: doc => ({}),
  filter: undefined // same effect as ({}) => true
}

class BlobCollection {
  store: S3Store
  view: View
  viewCache: lruCache.LRUCache<string, {}>
  datePartitions: {}

  get client(): any { return this.store.client }
  get bucket(): string { return this.store.bucket }
  get prefix(): string { return this.store.prefix }

  constructor({client, bucket, prefix, view}:
              {client: any, bucket: string, prefix: string,
              view: { version?: string, map?: any, filter?: any }}) {
    this.store = new S3Store({client, bucket, prefix})
    this.view = Object.assign({}, DEFAULT_VIEW, (view || {}))

    this.viewCache = lruCache({max: 500})

    this.datePartitions = {}
  }

  async list(before: any = null, limit: number = 100): {}[] {
    let date: Date, cutoff
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

    let docs = await Promise.all(takeRight(ids, limit).map(([id, etag]) => (
      this.getViewData(id, etag)
    )))
    if (typeof this.view.filter === 'function') {
      // TODO: if this reduces the number of docs below the limit,
      // add some that were removed because of the limit
      docs = docs.filter(doc => this.view.filter(doc))
    }
    // $FlowFixMe: Promise.all
    return docs
  }

  getDatePartition(dateOrId) {
    const date = (typeof dateOrId.toISOString === 'function'
                  ? dateOrId : ObjectID(dateOrId).getTimestamp())
    const dateString = isoDate(date)
    if (this.datePartitions[dateString]) {
      return this.datePartitions[dateString]
    } else {
      this.datePartitions[dateString] =
        new DatePartition({store: this.store, date})
      return this.datePartitions[dateString]
    }
  }

  async get(id: string, etag?: string): any {
    return await this.getDatePartition(id).get(id, etag)
  }

  async put(doc: any): any {
    const docWithId = this.constructor.ensureStringId(doc)
    const key = this.keyForDocument(docWithId._id)
    const result = await this.client.putObject({
      Body: JSON.stringify(docWithId),
      ContentType: 'application/json',
      Bucket: this.bucket,
      Key: key
    }).promise()
    this.setViewData(docWithId, result.ETag)
    return { _id: docWithId._id }
  }

  async getViewData(id: string, etag: string): {} {
    const viewData = this.viewCache.get(
      [id, etag, this.view.version].join(',')
    )
    return Object.assign({}, viewData, {_id: id, _etag: etag})
  }

  setViewData(doc: any, etag: any) {
    // TODO: pass updated date to view function
    this.viewCache.set(
      [doc._id, etag, this.view.version].join(','),
      this.view.map(doc, {})
    )
  }

  keyForDocument(id: string): string {
    const date = ObjectID(id).getTimestamp()
    return `${this.prefix}${isoDate(date)}/${id}.json`
  }

  static ensureStringId(doc: any): any {
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
