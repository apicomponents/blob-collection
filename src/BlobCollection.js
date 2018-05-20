//@flow
const S3Store = require("./S3Store");
const DatePartition = require("./DatePartition");
const Manifest = require("./Manifest");
const ObjectID = require("bson-objectid");
const values = require("./utils").values;
const isoDate = require("./utils").isoDate;

import type { View, DocWithEtag } from "./types";

const DEFAULT_VIEW = {
  version: "default",
  map: doc => ({}),
  filter: undefined // same effect as ({}) => true
};

class BlobCollection {
  store: S3Store;
  view: View;
  manifest: Manifest;
  datePartitions: { [string]: DatePartition };

  get client(): any {
    return this.store.client;
  }
  get bucket(): string {
    return this.store.bucket;
  }
  get prefix(): string {
    return this.store.prefix;
  }

  constructor({
    client,
    bucket,
    prefix,
    view
  }: {
    client: any,
    bucket: string,
    prefix: string,
    view: { version?: string, map?: any, filter?: any }
  }) {
    this.store = new S3Store({ client, bucket, prefix: prefix || "" });
    this.view = Object.assign({}, DEFAULT_VIEW, view || {});
    this.manifest = new Manifest({ store: this.store });

    this.datePartitions = {};
  }

  async list({
    before,
    limit
  }: {
    before?: Date | string,
    limit: number
  }): {}[] {
    limit = limit || 100;
    let date: Date;
    let cutoff: ?string;
    if (typeof before === "string") {
      date = ObjectID(before).getTimestamp();
      cutoff = before;
    } else if (before instanceof Date) {
      date = before;
      cutoff = `${ObjectID.createFromTime(
        Math.floor(date.valueOf() / 1000) + 1
      )}`;
    } else {
      date = new Date(Date.now() + 10 * 60 * 1000);
    }

    const dateString = isoDate(date);
    const datePartition = this.getDatePartition(dateString);
    let docs = await datePartition.list(cutoff, limit);
    if (docs.length < limit) {
      let dates = this.manifest.getDatesBefore(dateString, 4);
      for (let i = dates.length - 1; i >= 0; i--) {
        const dateString = dates[i];
        const datePartition = this.getDatePartition(dateString);
        let previousDocs = await datePartition.list(
          undefined,
          limit - docs.length
        );
        docs = previousDocs.concat(docs);
        if (docs.length === limit) {
          break;
        }
      }
    }
    // $FlowFixMe: Promise.all
    return docs;
  }

  getDatePartition(dateOrId: Date | string) {
    let dateString;
    if (dateOrId instanceof Date) {
      dateString = isoDate(dateOrId);
    } else if (dateOrId.length === 10) {
      dateString = dateOrId;
    } else {
      dateString = isoDate(ObjectID(dateOrId).getTimestamp());
    }
    if (this.datePartitions[dateString]) {
      return this.datePartitions[dateString];
    } else {
      this.datePartitions[dateString] = new DatePartition({
        store: this.store,
        view: this.view,
        manifest: this.manifest,
        date: dateString
      });
      return this.datePartitions[dateString];
    }
  }

  async get(id: string): Promise<?DocWithEtag> {
    return await this.getDatePartition(id).get(id);
  }

  async put(doc: any): any {
    const docWithId = this.constructor.ensureStringId(doc);
    await this.getDatePartition(docWithId._id).put(docWithId);
    return { _id: docWithId._id };
  }

  clearListCache() {
    values(this.datePartitions).forEach(datePartition => {
      datePartition.clearListCache();
    });
  }

  keyForDocument(id: string): string {
    const date = ObjectID(id).getTimestamp();
    return `${this.prefix}${isoDate(date)}/${id}.json`;
  }

  static ensureStringId(doc: any): any {
    if (doc._id === undefined) {
      return Object.assign({}, doc, { _id: ObjectID().toString() });
    } else if (typeof doc._id === "string" && doc._id.length === 24) {
      return doc;
    } else {
      let id = doc._id.toString();
      if (id.length !== 24) {
        id = ObjectID().toString();
      }
      return Object.assign({}, doc, { _id: id });
    }
  }
}

module.exports = BlobCollection;
