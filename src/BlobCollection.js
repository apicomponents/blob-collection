//@flow
const S3Store = require("./S3Store");
const DatePartition = require("./DatePartition");
const Manifest = require("./Manifest");
const ObjectID = require("bson-objectid");
const values = require("./utils").values;
const isoDate = require("./utils").isoDate;

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

  async list(before?: Date | string, limit: number = 100): {}[] {
    let date: Date;
    let cutoff: string;
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
      cutoff = `${ObjectID(Math.floor(date / 1000))}`;
    }

    const datePartition = this.getDatePartition(date);
    const docs = await datePartition.list(cutoff, limit);
    // $FlowFixMe: Promise.all
    return docs;
  }

  getDatePartition(dateOrId) {
    const date =
      dateOrId instanceof Date ? dateOrId : ObjectID(dateOrId).getTimestamp();
    const dateString = isoDate(date);
    if (this.datePartitions[dateString]) {
      return this.datePartitions[dateString];
    } else {
      this.datePartitions[dateString] = new DatePartition({
        store: this.store,
        view: this.view,
        manifest: this.manifest,
        date
      });
      return this.datePartitions[dateString];
    }
  }

  async get(id: string): any {
    return await this.getDatePartition(id).get(id);
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

  clearCache() {
    for (const datePartition of values(this.datePartitions)) {
      datePartition.clearCache();
    }
  }
}

module.exports = BlobCollection;
