//@flow
const debug = require("debug")("blob-collection");
const S3Store = require("./S3Store");
const DatePartition = require("./DatePartition");
const ObjectID = require("bson-objectid");

function isoDate(date: any) {
  return date.toISOString().substr(0, 10);
}

type View = {
  version: string,
  map: ({}, {}) => {},
  filter: ({}) => boolean
};

const DEFAULT_VIEW = {
  version: "default",
  map: doc => ({}),
  filter: undefined // same effect as ({}) => true
};

class BlobCollection {
  store: S3Store;
  view: View;
  datePartitions: {};

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

    this.datePartitions = {};
  }

  async list(before: any = null, limit: number = 100): {}[] {
    let date: Date, cutoff;
    if (before) {
      date = ObjectID(before).getTimestamp();
      cutoff = before;
    } else {
      date = new Date(Date.now() + 10 * 60 * 1000);
      cutoff = ObjectID(Math.floor(date / 1000)).toString();
    }

    const datePartition = this.getDatePartition(date);
    const docs = await datePartition.list({ beforeCutoff: cutoff, limit });
    // $FlowFixMe: Promise.all
    return docs;
  }

  getDatePartition(dateOrId) {
    const date =
      typeof dateOrId.toISOString === "function"
        ? dateOrId
        : ObjectID(dateOrId).getTimestamp();
    const dateString = isoDate(date);
    if (this.datePartitions[dateString]) {
      return this.datePartitions[dateString];
    } else {
      this.datePartitions[dateString] = new DatePartition({
        store: this.store,
        view: this.view,
        date
      });
      return this.datePartitions[dateString];
    }
  }

  async get(id: string, etag?: string): any {
    return await this.getDatePartition(id).get(id, etag);
  }

  async put(doc: any): any {
    const docWithId = this.constructor.ensureStringId(doc);
    await this.getDatePartition(docWithId._id).put(docWithId);
    return { _id: docWithId._id };
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
