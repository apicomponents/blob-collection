# BlobCollection

[![Build Status](https://travis-ci.com/apicomponents/blob-collection.svg?branch=master)](https://travis-ci.com/apicomponents/blob-collection)

A collection of documents with BSON IDs (the kinds of IDs used by
MongoDB), stored on top of a blobstore like S3. It's designed for
tiny self-hosted apps.

BSON IDs (the kind of IDs used by MongoDB) include the dates and
times, and `blob-collection` partitions the data in directories by
date. It's optimized for lookup of documents by time (think chat,
email, or logs).

Documents can be looked up with a _before_ value and a _limit_. It
will load up to _limit_ documents before the _before_ value, which
can be a BSON ID or a date. It may not load all, but it will load
at least one if one is available (subject to caching).

Documents have views for metadata, kind of like CouchDB, but much
less powerful. At present it only supports one view, and the view
takes a `version` which is used for cache invalidation, a `map`
function which takes a document and returns the data that will be
merged with the `_id` and the `_etag` and returned by `list`, and
a `filter` function which can be used to keep documents from
showing up when listing data. The views, through caching, allow
metadata to be returned with a list of documents, without having
to make a request for every key.

The view data is cached for each date partition, and it is saved
to the file a given amount of time (default 120 seconds) after a
document within a partition is updated. The metadata cache files
are also used to find previous dates when paging through results.
Document eTags are used in the metadata cache, along with the
version of the view, so stale data will never be returned.

It's designed to prevent a lightly used app that has a lot of
data in it from being expensive.

## Releases

None yet.

## Reading

- [AWS Documentation: Object Key and Metadata](https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingMetadata.html) - User-defined metadata isn't returned when listing objects, and must be fetched with a GET or HEAD on each object. There are also size limits and encoding limitations on user-defined metadata.
- [Reflections on S3's architectural flaws](https://medium.com/@jim_dowling/reflections-on-s3s-architectural-flaws-71f14c05a5fa) - Good overview, and it introduces s3mper and EMR File System, as well as that Spotify had to do something similar for its data on Google Cloud Storage
- [s3mper](https://github.com/Netflix/s3mper) - This runs on Java and updates to DynamoDB, to provide custom metadata.
- [Using EMR File System (EMRFS)](https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-fs.html) - This is indeed custom metadata on top of S3 that can be returned more than one at a time, but it requires EC2 instances.

## Roadmap

- List documents after a given time
- Cache lists of documents
- Additional views
- Attachments
- Subpartitions within dates
- Other types of partitioning (such as by hour for logs)
- Compression
- Store multiple documents in a single file, and batched writing
- Use with another database (could make it work for big apps too)

## License

MIT
