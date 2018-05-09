# blob-collections

[![Build Status](https://travis-ci.com/apicomponents/blob-collection.svg?branch=master)](https://travis-ci.org/apicomponents/blob-collection)

A collection of documents with MongoDB style IDs, stored on top of a
blobstore like S3.

MongoDB style IDs include the dates and times, and `blob-collection`
partitions the data in directories by date. It's optimized for lookup
of documents by time (think chat, email, or logs). Each directory
contains the documents, a default index of the data, and optional
custom indexes of the data.

Documents can be looked up by a before or after key. If there are
few messages per date, it may not return the requested amount of
documents. It will return at least one if one or more is available.

Indexes are updated for each date some time after an update has
been made. Lists are pulled from indexes.

For closer-to-realtime updating, add an `afterUpdate` callback,
and send the document IDs and etags to a channel that others are
subscribed to.