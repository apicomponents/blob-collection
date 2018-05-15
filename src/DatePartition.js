// @flow
const S3Store = require("./S3Store");
const takeWhile = require("lodash").takeWhile;
const takeRight = require("lodash").takeRight;
const compact = require("lodash").compact;
const delay = require("./utils").delay;
const Manifest = require("./Manifest");

import type { View, DocWithEtag } from "./types";

class DatePartition {
  store: S3Store;
  view: View;
  manifest: Manifest;
  date: string;
  viewCache: { [string]: { [string]: any } };
  loadPromise: ?Promise<void>;
  savePromise: ?Promise<void>;
  saving: boolean;
  saveAgain: boolean;
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

  get key() {
    return `${this.prefix}views/${this.date}.json`;
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
    date: string
  }) {
    this.store = store;
    this.view = view;
    this.manifest = manifest;
    this.date = date;

    this.viewCache = {};
    this.saving = false;
    this.saveAgain = false;
  }

  async get(id: string): Promise<DocWithEtag | void> {
    const key = `${this.prefix}${this.date}/${id}.json`;
    let response;
    try {
      response = await this.getKey(key);
    } catch (err) {
      response = undefined;
    }
    if (response === undefined) {
      await this.store.retryDelay();
      try {
        response = await this.getKey(key);
      } catch (err) {
        return;
      }
    }
    const doc = JSON.parse(response.Body.toString("utf8"));
    doc._etag = response.ETag;
    this.setViewData(doc);
    return doc;
  }

  getKey(key: string): Promise<any> {
    return this.client
      .getObject({
        Bucket: this.bucket,
        Key: key
      })
      .promise();
  }

  async put(doc: any): Promise<DocWithEtag> {
    const key = `${this.prefix}${this.date}/${doc._id}.json`;
    let response;
    try {
      response = await this.client
        .putObject({
          Body: JSON.stringify(doc),
          ContentType: "application/json",
          Bucket: this.bucket,
          Key: key
        })
        .promise();
    } catch (err) {
      throw new Error(
        `Error saving doc with ID ${JSON.stringify(doc._id)}: ${err}`
      );
    }
    doc._etag = response.ETag;
    this.setViewData(doc);
    this.manifest.addDate(this.date);
    return { _id: doc._id, _etag: doc._etag };
  }

  async list(beforeCutoff: string, limit: number = 100) {
    let ids = await this.listKeys();
    ids = takeWhile(ids, ([id, etag]) => id < beforeCutoff);

    let docs;
    if (typeof this.view.filter === "function") {
      docs = await Promise.all(
        ids.map(([id, etag]) => this.getViewData(id, etag))
      );
      docs = compact(docs).filter(doc => this.view.filter(doc));
      docs = takeRight(docs, limit);
    } else {
      ids = takeRight(ids, limit);
      docs = await Promise.all(
        ids.map(([id, etag]) => this.getViewData(id, etag))
      );
      docs = compact(docs);
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
        Prefix: `${this.prefix}${this.date}/`,
        Delimiter: "/"
      })
      .promise();
    return response.Contents.map(e => {
      const match = e.Key.match(/([0-9a-f]{24})[^\/]*$/);
      const key = (match && match[1]) || "";
      return [key, e.ETag];
    }).filter(([id, etag]) => id && etag);
  }

  async getViewData(id: string, etag: string): Promise<?{}> {
    const viewKey = [id, etag, this.view.version].join(",");
    let viewData = this.viewCache[viewKey];
    if (viewData === undefined) {
      await this.load();
      viewData = this.viewCache[viewKey];
    }
    if (viewData === undefined) {
      let doc = await this.get(id);
      if (doc === undefined) {
        return;
      } else {
        const updatedViewKey = [id, doc._etag, this.view.version].join(",");
        viewData = this.viewCache[updatedViewKey];
      }
    }
    return Object.assign({}, viewData, { _id: id, _etag: etag });
  }

  setViewData(doc: DocWithEtag) {
    // TODO: pass updated date to view function
    const viewKey = [doc._id, doc._etag, this.view.version].join(",");
    this.viewCache[viewKey] = this.view.map(doc, {});
    this.save();
  }

  async loadFromBlob(): Promise<void> {
    let response;
    try {
      response = await this.client
        .getObject({
          Bucket: this.bucket,
          Key: this.key
        })
        .promise();
    } catch (err) {
      return;
    }
    const data = JSON.parse(response.Body.toString("utf8"));
    this.loadJSON(data);
    this.lastLoaded = Date.now();
  }

  async load(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    const loadedRecently =
      this.lastLoaded !== undefined && Date.now() - this.lastLoaded < 60 * 1000;
    if (!loadedRecently) {
      this.loadPromise = this.loadFromBlob();
      await this.loadPromise;
      this.loadPromise = undefined;
    }
  }

  async save(): Promise<void> {
    if (this.savePromise) {
      if (this.saving) {
        this.saveAgain = true;
      }
      await this.savePromise;
      if (this.saveAgain) {
        this.saveAgain = false;
        this.savePromise = this.saveToBlobAfterDelay();
        await this.savePromise;
        this.savePromise = undefined;
      }
      return;
    }

    this.savePromise = this.saveToBlobAfterDelay();
    await this.savePromise;
    this.savePromise = undefined;
  }

  async saveToBlobAfterDelay(): Promise<void> {
    await delay(1000);
    await this.saveToBlob();
  }

  async saveToBlob(): Promise<void> {
    this.saving = true;
    try {
      await this.client
        .putObject({
          Body: JSON.stringify(this),
          ContentType: "application/json",
          Bucket: this.bucket,
          Key: this.key
        })
        .promise();
    } catch (err) {
      this.saving = false;
      return;
    }
    this.saving = false;
  }

  loadJSON(data: { data: { [string]: any } }): void {
    Object.assign(this.viewCache, data.data);
  }

  toJSON(): { data: { [string]: any } } {
    return {
      data: this.viewCache
    };
  }

  clearCache() {
    this.viewCache = {};
  }
}

module.exports = DatePartition;
