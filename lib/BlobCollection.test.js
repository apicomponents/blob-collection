const AWS = require('aws-sdk')
const client = new AWS.S3({
  endpoint: 'http://127.0.0.1:9000',
  accessKeyId: 'Y0147NYK7VO1SQIKQHTW',
  secretAccessKey: 'CbKvZiqYsKfruamlxD6ZVk36w5puMSI/zCbgZo8H',
  s3ForcePathStyle: true
})
const BlobCollection = require('./BlobCollection')
const bucket = `test-blob-collections-${require('bson-objectid').generate()}`

beforeAll(async () => {
  await client.createBucket({Bucket: bucket}).promise()
})

test('put and get a document with an id', async () => {
  const collection = new BlobCollection({client, bucket, prefix: 'animals'})
  const doc = { _id: '5af27c83e2c74b359df5fa14', message: 'turtles' }
  await collection.put(doc)
  const theDoc = await collection.get(doc._id)
  expect(theDoc).toEqual(doc)
})