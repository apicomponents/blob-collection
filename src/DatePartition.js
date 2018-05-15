// @flow
const S3Store = require("./S3Store");
const takeWhile = require("lodash").takeWhile;
const takeRight = require("lodash").takeRight;
const delay = require("./utils").delay;
const Manifest = require("./Manifest");

type View = {
  version: string,
  map: ({}, {}) => {},
  filter: ({}) => boolean
};

type DocWithEtag = {
  _id: string,
  _etag: string,
  [string]: any
};

class DatePartition {
  store: S3Store;
  view: View;
  manifest: Manifest;
  date: Date;
  _isoDate: string;
  viewCache: { [string]: { [string]: any } };
  savePromise: Promise<void>;
  saving: boolean;
  lastLoaded: number;

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
    manifest,
    date
  }: {
    store: S3Store,
    view: View,
    manifest: Manifest,
    date: Date
  }) {
    this.store = store;
    this.view = view;
    this.manifest = manifest;
    this.date = date;

    this.viewCache = {};
    this.saving = false;
  }

  async get(id: string): Promise<DocWithEtag> {
    const key = `${this.prefix}${this.isoDate}/${id}.json`;
    const response = await this.client
      .getObject({
        Bucket: this.bucket,
        Key: key
      })
      .promise();
    const doc = JSON.parse(response.Body.toString("utf8"));
    doc._etag = response.ETag;
    this.setViewData(doc);
    return doc;
  }

  async put(doc: any): Promise<DocWithEtag> {
    const key = `${this.prefix}${this.isoDate}/${doc._id}.json`;
    const response = await this.client
      .putObject({
        Body: JSON.stringify(doc),
        ContentType: "application/json",
        Bucket: this.bucket,
        Key: key
      })
      .promise();
    doc._etag = response.ETag;
    this.setViewData(doc);
    this.manifest.addDate(this.isoDate);
    return { _id: doc._id, _etag: doc._etag };
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
    const viewKey = [id, etag, this.view.version].join(",");
    let viewData = this.viewCache[viewKey];
    if (viewData === undefined) {
      await this.load();
      const doc = await this.get(id);
      const updatedViewKey = [id, doc._etag, this.view.version].join(",");
      viewData = this.viewCache[updatedViewKey];
    }
    return Object.assign({}, viewData, { _id: id, _etag: etag });
  }

  setViewData(doc: DocWithEtag) {
    // TODO: pass updated date to view function
    const viewKey = [doc._id, doc._etag, this.view.version].join(",");
    this.viewCache[viewKey] = this.view.map(doc, {});
    this.save();
  }

  async load(): Promise<void> {
    // const loadedRecently =
    //   this.lastLoaded !== undefined && Date.now() - this.lastLoaded < 60 * 1000;
    // if (!loadedRecently) {
    //   this.lastLoaded = Date.now();
    // }
  }

  async save(): Promise<void> {
    // if (this.savePromise) {
    //   await Promise.all([this.load(), delay(1000)]);
    // }
  }

  clearCache() {
    this.viewCache = {};
  }
}

module.exports = DatePartition;
