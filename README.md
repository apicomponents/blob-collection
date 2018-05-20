# BlobCollection

[![Build Status][build-status-image]][build-status]

A collection of documents with BSON IDs (the kinds of IDs used by MongoDB),
stored on top of a blobstore like S3. It's designed for tiny self-hosted apps.

BSON IDs (the kind of IDs used by MongoDB) include the dates and times, and
`blob-collection` partitions the data in directories by date. It's optimized for
lookup of documents by time (think chat, email, or logs).

Documents can be listed with a _before_ value and a _limit_. It will load up to
_limit_ documents before the _before_ value, which can be a BSON ID or a date.
It may not load all, but it will load at least one if one is available (subject
to caching).

Documents have views for metadata, kind of like CouchDB, but much less powerful.
At present it only supports one view, and the view takes a `version` which is
used for cache invalidation, a `map` function which takes a document and returns
the data that will be merged with the `_id` and the `_etag` and returned by
`list`, and a `filter` function which can be used to keep documents from showing
up when listing data. The views, through caching, allow metadata to be returned
with a list of documents, without having to make a request for every key.

The view data is cached for each date partition, and it is saved to the file a
certain amount of time (currently 1 second) after a document within a partition
is updated. The metadata cache files are also used to find previous dates when
paging through results. Document eTags are used in the metadata cache, along
with the version of the view, to prevent stale data from being returned.

It's intended to provide permanent storage that's inexpensive, yet sufficient
for self-hosted apps.

## How it works

* BlobCollection.new
  * Doesn't make any requests to S3
* Collection.put(doc)
  * Puts the document into `${isoDate}/${id}.json`
  * Puts the view data into memory
  * Gets the list of dates from `manifest.json`
  * If the date isn't in the list of dates, adds it and writes out the manifest
    file
  * after one second, or immediately if the date wasn't in the manifest, reads
    `views/${isoDate}.json`, adds the view data to it, and writes it.
* Collection.get(doc)
  * Gets the document from `${isoDate}/${id}.json` and returns it
* Collection.delete(doc)
  * Deletes the document from `${isoDate}/${id}.json`
  * Puts the deletion into memory
  * After one second, reads `views/${isoDate}.json`, removes the document from
    it, and writes it
* Collection.list(before)
  * Gets the list of dates from `manifest.json`
  * Finds the first date to look at
  * Gets `indexes/${isoDate}.json` and `views/${isoDate}.json`. If the view is
    newer, lists the objects in the Blobstore to regenerate the index, and
    writes it back. Reads the view data into memory.
  * Gets the requested number of documents from the index, and the view data.
    Tries to get the view data from memory first, and if it isn't found, reads
    the documents to get the view data.
  * If there aren't enough to satisfy the limit, goes to the previous date in
    the manifest and gets more, until it reaches the limit of dates to read.
* Collection.clearListCache()
  * This is to reduce _list_ requests which can be expensive, when polling.
  * If there are multiple clients, a publish-subscribe should be set to call
    this on all clients whenever `put()` is called. Otherwise lists on other
    clients won't be updated for the maximum age of the cache (5 minutes).

## API

### Creating a BlobCollection

To create a collection, provide an S3 client, an S3 bucket, an optional prefix,
and a view function which determines which data will be available in the index,
as well as a view version to allow updates to the view function:

```javascript
const client = require("./clients").S3Client;
const bucket = "my-nifty-blog";
const map = doc => {
  const summary = doc.body.substring(0, 100);
  return { title: doc.title, title: doc.author, summary };
};
const view = { map, version: "v1" };
const collection = new BlobCollection({
  client,
  bucket,
  prefix: "posts",
  view
});
```

Parameters:

* `new BlobCollection({...params})`
  * `params.client`: An S3 Client from [aws-sdk][aws-sdk]
  * `params.bucket` (string): The S3 bucket
  * `params.prefix` (string): Optional. The prefix for the files. Example:
    `posts/`
  * `params.view` (`viewParams`)
    * `viewParams.map` (`object => object`): Optional. This is called with the
      document and returns an object that is used when creating the view.
    * `viewParams.filter` (`object => boolean`): Optional. This is called with
      the document and if it returns false, the document will be excluded when listing the data.
    * `viewParams.version`: Optional. The version that will be used when
      storing and retrieving view documents. Provides the ability to update the
      view without manually deleting the view documents and restarting the
      servers.

## Releases

None yet.

## Reading

* [AWS Documentation: Object Key and Metadata][s3-docs-metadata] - User-defined
  metadata isn't returned when listing objects, and must be fetched with a GET
  or HEAD on each object. There are also size limits and encoding limitations on user-defined metadata.
* [Reflections on S3's architectural flaws][s3-flaws-blog-post] - Good overview,
  and it introduces s3mper and EMR File System, as well as that Spotify had to
  do something similar for its data on Google Cloud Storage
* [s3mper][s3mper] - This runs on Java and updates to DynamoDB, to provide
  custom metadata.
* [Using EMR File System (EMRFS)][emrfs] - This is indeed custom metadata on top
  of S3 that can be returned more than one at a time, but it requires EC2
  instances.

## Roadmap

* List documents after a given time
* Cache lists of documents in storage
* Additional views with keys other than creation date
* Support storing view data in postgres to allow for more clients
* Partitioned views
* Detect other clients and increase polling when other clients are found, for
  transparent scaling (intermittent pub sub)
* Attachments
* Subpartitions within dates
* Other types of partitioning (such as by hour for logs)
* Compression
* Store multiple documents in a single file, with batched writing
* Use with another database (could make it work for big apps too)

## License

MIT

[build-status]: https://travis-ci.com/apicomponents/blob-collection
[build-status-image]: https://travis-ci.com/apicomponents/blob-collection.svg?branch=master
[s3-docs-metadata]: https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingMetadata.html
[s3-flaws-blog-post]: https://medium.com/@jim_dowling/reflections-on-s3s-architectural-flaws-71f14c05a5fa
[s3mper]: https://github.com/Netflix/s3mper
[emrfs]: https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-fs.html
[aws-sdk]: https://aws.amazon.com/sdk-for-node-js/
