// @flow
const delay = require("./utils").delay;

class S3Store {
  client: any;
  bucket: string;
  prefix: string;
  retryDelayRange: [number, number];

  constructor({
    client,
    bucket,
    prefix,
    retryDelayRange
  }: {
    client: string,
    bucket: string,
    prefix: string,
    retryDelayRange?: [number, number]
  }) {
    this.client = client;
    this.bucket = bucket;
    this.prefix = prefix;
    this.retryDelayRange = retryDelayRange || [500, 1000];
  }

  retryDelay(): Promise<void> {
    const difference = this.retryDelayRange[1] - this.retryDelayRange[0];
    return delay(
      this.retryDelayRange[0] + Math.floor(Math.random() * (difference + 1))
    );
  }
}

module.exports = S3Store;
