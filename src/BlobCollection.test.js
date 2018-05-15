const ObjectID = require("bson-objectid");
const faker = require("faker");
const takeRight = require("lodash").takeRight;
const AWS = require("aws-sdk");
const isoDate = require("./utils").isoDate;
const delay = require("./utils").delay;
const client = new AWS.S3({
  endpoint: "http://127.0.0.1:9000",
  accessKeyId: "Y0147NYK7VO1SQIKQHTW",
  secretAccessKey: "CbKvZiqYsKfruamlxD6ZVk36w5puMSI/zCbgZo8H",
  s3ForcePathStyle: true
});
const BlobCollection = require("./BlobCollection");

afterEach(() => {
  jest.restoreAllMocks();
});

test("put and get a document with an id", async () => {
  const bucket = `test-blob-collections-${ObjectID()}`;
  await client.createBucket({ Bucket: bucket }).promise();
  const collection = new BlobCollection({ client, bucket, prefix: "animals/" });
  const doc = { _id: "5af27c83e2c74b359df5fa14", message: "turtles" };
  await collection.put(doc);
  const theDoc = await collection.get(doc._id);
  expect(theDoc).toEqual(doc);
});

test("list docs within a day", async () => {
  const bucket = `test-blob-collections-${ObjectID()}`;
  const prefix = "people/";
  await client.createBucket({ Bucket: bucket }).promise();
  const collection = new BlobCollection({
    client,
    bucket,
    prefix,
    view: {
      map: doc => ({
        name: doc.name
      })
    }
  });

  // add the docs
  const datePartition = collection.getDatePartition(new Date());
  const spy = jest.spyOn(collection.manifest, "saveToBlob");
  const spy2 = jest.spyOn(datePartition, "saveToBlobAfterDelay");
  const nowDate = new Date();
  const now = Math.floor(nowDate.valueOf() / 1000);
  let offsets = [];
  for (let i = 0; i < 150; i++) {
    offsets.push(-1 * Math.floor(Math.random() * 30 * 60));
  }
  for (let i = 0; i < 3; i++) {
    offsets.push(Math.floor(Math.random() * 5 * 60));
  }
  offsets.sort((a, b) => a - b);
  const docs = offsets.map(offset => ({
    _id: ObjectID(now + offset).toString(),
    name: faker.name.findName(),
    email: faker.internet.email(),
    phone: faker.phone.phoneNumber(),
    address: faker.address.streetAddress(),
    city: faker.address.city(),
    state: faker.address.stateAbbr(),
    zipCode: faker.address.zipCode()
  }));
  let remainingDocs = docs.slice();
  while (remainingDocs.length) {
    const batch = remainingDocs.slice(0, 10);
    remainingDocs = remainingDocs.slice(10);
    await Promise.all(
      batch.map(doc => {
        return collection.put(doc);
      })
    );
  }
  const directResponse = await client
    .listObjectsV2({
      Bucket: bucket,
      MaxKeys: 100,
      Prefix: `${prefix}${isoDate(nowDate)}/`,
      Delimiter: "/"
    })
    .promise();
  const directKeys = directResponse.Contents.map(e => e.Key);
  expect(directKeys.length).toEqual(100);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy2.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(spy2.mock.calls.length).toBeLessThanOrEqual(3);

  // get the list
  const docs2 = await collection.list();
  const unsortedKeys1 = takeRight(docs, 100).map(doc => doc._id);
  const sortedKeys1 = unsortedKeys1.slice();
  sortedKeys1.sort();
  const unsortedKeys2 = docs2.map(doc => doc._id);
  const sortedKeys2 = unsortedKeys2.slice();
  sortedKeys2.sort();
  expect(unsortedKeys1).toEqual(sortedKeys1);
  expect(unsortedKeys2).toEqual(sortedKeys2);
  expect(sortedKeys1.length).toEqual(sortedKeys2.length);
  expect(sortedKeys1).toEqual(sortedKeys2);
  expect(docs2.length).toEqual(100);
  expect(docs2[docs2.length - 1]._id).toEqual(docs[docs.length - 1]._id);
  expect(
    Object.keys(docs2[0])
      .slice()
      .sort()
  ).toEqual(["_id", "_etag", "name"].sort());

  // get the list without the cache
  await delay(2);
  const loadSpy = jest.spyOn(datePartition, "loadFromBlob");
  const getSpy = jest.spyOn(datePartition, "get");
  collection.clearCache();
  const docs3 = await collection.list();
  expect(docs3.length).toEqual(100);
  expect(loadSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(getSpy.mock.calls.length).toBeLessThan(10);
});

async function testAcrossDays(daysAgoArray) {
  const bucket = `test-blob-collections-${ObjectID()}`;
  const prefix = "people/";
  await client.createBucket({ Bucket: bucket }).promise();
  const collection = new BlobCollection({
    client,
    bucket,
    prefix,
    view: {
      map: doc => ({
        name: doc.name
      })
    }
  });

  // add the docs
  const datePartition = collection.getDatePartition(new Date());
  const spy = jest.spyOn(collection.manifest, "saveToBlob");
  const spy2 = jest.spyOn(datePartition, "saveToBlobAfterDelay");
  const nowDate = new Date();
  const now = Math.floor(nowDate.valueOf() / 1000);
  let offsets = [];
  daysAgoArray.forEach(daysAgo => {
    for (let i = 0; i < 30; i++) {
      offsets.push(daysAgo * -86400 + -1 * Math.floor(Math.random() * 30 * 60));
    }
  });
  if (daysAgoArray[0] === 0) {
    for (let i = 0; i < 3; i++) {
      offsets.push(Math.floor(Math.random() * 5 * 60));
    }
  }
  offsets.sort((a, b) => a - b);
  const docs = offsets.map(offset => ({
    _id: ObjectID(now + offset).toString(),
    name: faker.name.findName(),
    email: faker.internet.email(),
    phone: faker.phone.phoneNumber(),
    address: faker.address.streetAddress(),
    city: faker.address.city(),
    state: faker.address.stateAbbr(),
    zipCode: faker.address.zipCode()
  }));
  let remainingDocs = docs.slice();
  while (remainingDocs.length) {
    const batch = remainingDocs.slice(0, 10);
    remainingDocs = remainingDocs.slice(10);
    await Promise.all(
      batch.map(doc => {
        return collection.put(doc);
      })
    );
  }
  const directResponse = await client
    .listObjectsV2({
      Bucket: bucket,
      MaxKeys: 100,
      Prefix: `${prefix}${isoDate(nowDate)}/`,
      Delimiter: "/"
    })
    .promise();
  const directKeys = directResponse.Contents.map(e => e.Key);
  expect(spy.mock.calls.length).toBeGreaterThanOrEqual(5);
  expect(spy.mock.calls.length).toBeLessThanOrEqual(6);
  expect(spy2.mock.calls.length).toBeGreaterThanOrEqual(
    daysAgoArray[0] === 0 ? 1 : 0
  );
  expect(spy2.mock.calls.length).toBeLessThanOrEqual(3);

  // get the list
  const docs2 = await collection.list();
  const unsortedKeys1 = takeRight(docs, 100).map(doc => doc._id);
  const sortedKeys1 = unsortedKeys1.slice();
  sortedKeys1.sort();
  const unsortedKeys2 = docs2.map(doc => doc._id);
  const sortedKeys2 = unsortedKeys2.slice();
  sortedKeys2.sort();
  expect(unsortedKeys1).toEqual(sortedKeys1);
  expect(unsortedKeys2).toEqual(sortedKeys2);
  expect(sortedKeys1.length).toEqual(sortedKeys2.length);
  expect(sortedKeys1).toEqual(sortedKeys2);
  expect(docs2.length).toEqual(100);
  expect(docs2[docs2.length - 1]._id).toEqual(docs[docs.length - 1]._id);
  expect(
    Object.keys(docs2[0])
      .slice()
      .sort()
  ).toEqual(["_id", "_etag", "name"].sort());
}

test("test across days (consecutive)", async () => {
  await testAcrossDays([0, 1, 2, 3, 4]);
});

test("test across days (sparse)", async () => {
  await testAcrossDays([5, 12, 17, 18, 29]);
});
