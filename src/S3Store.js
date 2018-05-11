// @flow
class S3Store {
  client: any;
  bucket: string;
  prefix: string;

  constructor({
    client,
    bucket,
    prefix
  }: {
    client: string,
    bucket: string,
    prefix: string
  }) {
    this.client = client;
    this.bucket = bucket;
    this.prefix = prefix;
  }
}

module.exports = S3Store;
