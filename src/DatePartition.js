class DatePartition {
  get client() { return this.store.client }
  get bucket() { return this.store.bucket }
  get prefix() { return this.store.prefix }

  get isoDate() {
    if (! this._isoDate) {
      this._isoDate = this.date.toISOString().substr(0, 10)
    }
    return this._isoDate
  }

  constructor({store, date}) {
    this.store = store
    this.date = date
  }

  async get(id, etag = undefined) {
    const key = `${this.prefix}${this.isoDate}/${id}.json`
    const response = await this.client.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise()
    return JSON.parse(response.Body.toString('utf8'))
  }

  async listKeys() {
    const response = await this.client.listObjectsV2({
      Bucket: this.bucket,
      MaxKeys: 1000,
      Prefix: `${this.prefix}${this.isoDate}/`,
      Delimiter: '/'
    }).promise()
    return response.Contents.map(e => {
      const match = e.Key.match(/([0-9a-f]{24})[^\/]*$/)
      const key = match && match[1]
      return [key, e.ETag]
    }).filter(([id, etag]) => id && etag)
  }
}

module.exports = DatePartition
