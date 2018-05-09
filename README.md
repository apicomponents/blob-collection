# blob-collections

A collection of documents with MongoDB style IDs, stored on top of a
blobstore like S3.

MongoDB style IDs include the dates and times, and `blob-collection`
partitions the data in directories by date. It's optimized for lookup
of documents by time (think chat, email, or logs). Each directory
contains the documents, a default index of the data, and optional
custom indexes of the data.

