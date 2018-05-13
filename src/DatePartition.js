// @flow
const S3Store = require("./S3Store");
const lruCache = require("lru-cache");
const takeWhile = require("lodash.takewhile");
const takeRight = require("lodash.takeright");

type View = {
  version: string,
  map: ({}, {}) => {},
  filter: ({}) => boolean
};

class DatePartition {
  store: S3Store;
  view: View;
  date: Date;
  _isoDate: string;
  viewCache: lruCache.LRUCache<string, {}>;

  get client() {
    return this.store.client;
  }
  get bucket() {
    return this.store.bucket;
  }
  get prefix() {
    return this.store.prefix;
  }

  get isoDate() {
    if (!this._isoDate) {
      this._isoDate = this.date.toISOString().substr(0, 10);
    }
    return this._isoDate;
  }

  constructor({
    store,
    view,
    date
  }: {
    store: S3Store,
    view: View,
    date: Date
  }) {
    this.store = store;
    this.view = view;
    this.date = date;

    this.viewCache = lruCache({ max: 500 });
  }

  async get(id: string, etag?: string): {} {
    const key = `${this.prefix}${this.isoDate}/${id}.json`;
    const response = await this.client
      .getObject({
        Bucket: this.bucket,
        Key: key
      })
      .promise();
    return JSON.parse(response.Body.toString("utf8"));
  }

  async put(doc: any) {
    const key = `${this.prefix}${this.isoDate}/${doc._id}.json`;
    const result = await this.client
      .putObject({
        Body: JSON.stringify(doc),
        ContentType: "application/json",
        Bucket: this.bucket,
        Key: key
      })
      .promise();
    this.setViewData(doc, result.ETag);
  }

  async list(beforeCutoff: string, limit: number = 100) {
    let ids = await this.listKeys();
    ids = takeWhile(ids, ([id, etag]) => id < beforeCutoff);

    let docs = await Promise.all(
      takeRight(ids, limit).map(([id, etag]) => this.getViewData(id, etag))
    );
    if (typeof this.view.filter === "function") {
      // TODO: if this reduces the number of docs below the limit,
      // add some that were removed because of the limit
      docs = docs.filter(doc => this.view.filter(doc));
    }
    return docs;
  }

  async listKeys(): Promise<[string, string][]> {
    const response: {
      Contents: { Key: string, ETag: string }[]
    } = await this.client
      .listObjectsV2({
        Bucket: this.bucket,
        MaxKeys: 1000,
        Prefix: `${this.prefix}${this.isoDate}/`,
        Delimiter: "/"
      })
      .promise();
    return response.Contents.map(e => {
      const match = e.Key.match(/([0-9a-f]{24})[^\/]*$/);
      const key = (match && match[1]) || "";
      return [key, e.ETag];
    }).filter(([id, etag]) => id && etag);
  }

  async getViewData(id: string, etag: string): {} {
    const viewData = this.viewCache.get(
      [id, etag, this.view.version].join(",")
    );
    return Object.assign({}, viewData, { _id: id, _etag: etag });
  }

  setViewData(doc: any, etag: any) {
    // TODO: pass updated date to view function
    this.viewCache.set(
      [doc._id, etag, this.view.version].join(","),
      this.view.map(doc, {})
    );
  }
}

module.exports = DatePartition;
