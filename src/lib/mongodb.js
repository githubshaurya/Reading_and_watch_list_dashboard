// src/lib/mongodb.js

import { MongoClient } from 'mongodb';
const uri = process.env.MONGODB_URI;
let client;
let clientPromise;
if (!uri) throw new Error('Please add Mongo URI');
if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}
export default clientPromise;
