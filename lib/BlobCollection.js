const oid = require('bson-objectid')

function isoDate(date) {
  return date.toISOString().substr(0, 10)
}

class BlobCollection {
  constructor({client, bucket, prefix}) {
    this.client = client
    this.bucket = bucket
    this.prefix = prefix
  }

  list(before = null, after = null, count = 100) {
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
    const key = this.keyForDocument(doc._id)
    console.log(this.bucket)
    await this.client.putObject({
      Body: JSON.stringify(doc),
      ContentType: 'application/json',
      Bucket: this.bucket,
      Key: key
    }).promise()
  }

  keyForDocument(id) {
    const date = oid.createFromHexString(id).getTimestamp()
    return `${this.prefix}/${isoDate(date)}/${id}.json`
  }
}

module.exports = BlobCollection