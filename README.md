# blob-collections

[![Build Status](https://travis-ci.com/apicomponents/blob-collection.svg?branch=master)](https://travis-ci.com/apicomponents/blob-collection)

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
been made. Lists are pulled from indexes, unless it's specified to
get it directly from storage.

Efforts are made to make sure only one client is trying to update
the index for a partition at a time. Each client has an ID that
they know, and a `current-update` object is created with their ID.
Before starting to index, and after making so many requests, and
before writing an index, the client checks `current-update` to see
if it's empty, is out of date, or has the eTag set when they
created it. If it does, the client does a `putObject` on
`current-update` and stores the eTag. Also to stagger the attempts
to update, if there is not a timeout set or an update in progress
after an update is done, the client sets a timeout with a random
number of milliseconds within a range according to the update
frequency.

For live updating the display, polling the index for the current
date is generally the way to go, as GET requests are cheaper and
faster than LIST requests. For faster updating, add PubSub and
either send IDs and eTags or send data.
