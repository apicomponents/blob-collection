class S3Store {
  constructor({client, bucket, prefix}) {
    this.client = client
    this.bucket = bucket
    this.prefix = prefix
  }
}

module.exports = S3Store
