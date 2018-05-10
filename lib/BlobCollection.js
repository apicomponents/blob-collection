const ObjectID = require('bson-objectid')
const lruCache = require('lru-cache')

function isoDate(date) {
  return date.toISOString().substr(0, 10)
}

class BlobCollection {
  constructor({client, bucket, prefix, metadata, defaultMetadata}) {
    this.client = client
    this.bucket = bucket
    this.prefix = prefix
    this.metadata = metadata || { defaultMetadata: ({_id}) => ({}) }
    this.defaultMetadata = defaultMetadata || 'defaultMetadata'

    this.metadataCache = lruCache({max: 500})
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

    let ids = await this.listDate(date)
    let i;
    for (i = 0; i < ids.length && ids[i][0] < cutoff; i++) {
      // do nothing
    }
    ids = ids.slice(0, i)

    return ids.slice(Math.min(ids.length - limit, 100)).map(([id, etag]) => {
      const metadata = this.metadataCache.get(
        [id, etag, this.defaultMetadata].join(',')
      )
      return { _id: id, ...metadata }
    })
  }

  async listDate(date) {
    const response = await this.client.listObjectsV2({
      Bucket: this.bucket,
      MaxKeys: 1000,
      Prefix: `${this.prefix}${isoDate(date)}/`,
      Delimiter: '/'
    }).promise()
    return response.Contents.map(e => {
      const match = e.Key.match(/([0-9a-f]{24})[^\/]*$/)
      const key = match && match[1]
      return [key, e.ETag]
    }).filter(e => e[0] && e[1])
  }

  async get(id) {
    const key = this.keyForDocument(id)
    const response = await this.client.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise()
    return JSON.parse(response.Body.toString('utf8'))
  }

  async put(doc) {
    const id = doc._id ? doc._id.toString() : ObjectID().toString()
    const docData = {...doc, _id: id }
    const key = this.keyForDocument(docData._id)
    const result = await this.client.putObject({
      Body: JSON.stringify(doc),
      ContentType: 'application/json',
      Bucket: this.bucket,
      Key: key
    }).promise()
    this.metadataCache.set(
      [doc._id, result.ETag, this.defaultMetadata].join(','),
      this.metadata[this.defaultMetadata](doc)
    )
    return { _id: docData._id }
  }

  keyForDocument(id) {
    const date = ObjectID(id).getTimestamp()
    return `${this.prefix}${isoDate(date)}/${id}.json`
  }
}

module.exports = BlobCollection