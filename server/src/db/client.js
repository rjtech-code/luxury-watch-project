import 'dotenv/config';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import { MODELS } from './models.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env.');
}

export const mongo = new MongoClient(uri, { maxPoolSize: Number(process.env.DB_POOL_MAX ?? 10), ignoreUndefined: true });
export const database = mongo.db(); // the database named in the URI path

const NO_ID = { _id: 0 };
const isOperatorUpdate = (u) => Array.isArray(u) || Object.keys(u).some((k) => k.startsWith('$'));
const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * A thin layer over one collection. Documents are addressed by their own `id` (a UUID string) or natural
 * key, never by Mongo's `_id`, which is hidden from every read so API responses look the same as before.
 * Every method takes an optional `session` so it can run inside withTx().
 */
class Model {
  constructor(name, { defaults = () => ({}), hasId = true } = {}) {
    this.name = name;
    this.defaults = defaults;
    this.hasId = hasId;
  }

  get col() {
    return database.collection(this.name);
  }

  build(doc) {
    return { ...(this.hasId ? { id: crypto.randomUUID() } : {}), ...this.defaults(), ...stripUndefined(doc) };
  }

  find(filter = {}, { sort, limit, skip, projection, session } = {}) {
    let cur = this.col.find(filter, { projection: { ...projection, ...NO_ID }, session });
    if (sort) cur = cur.sort(sort);
    if (skip) cur = cur.skip(skip);
    if (limit) cur = cur.limit(limit);
    return cur.toArray();
  }

  findOne(filter, { projection, sort, session } = {}) {
    return this.col.findOne(filter, { projection: { ...projection, ...NO_ID }, sort, session });
  }

  count(filter = {}, { session } = {}) {
    return this.col.countDocuments(filter, { session });
  }

  async insert(doc, { session } = {}) {
    const row = this.build(doc);
    await this.col.insertOne({ ...row }, { session });
    return row;
  }

  async insertMany(docs, { session, ignoreDuplicates = false } = {}) {
    if (!docs.length) return [];
    const rows = docs.map((d) => this.build(d));
    try {
      await this.col.insertMany(rows.map((r) => ({ ...r })), { session, ordered: !ignoreDuplicates });
    } catch (err) {
      // "insert ... on conflict do nothing": keep going past rows that already exist.
      if (!(ignoreDuplicates && err.code === 11000 && (err.writeErrors ?? [err]).every((e) => (e.code ?? e.err?.code) === 11000))) throw err;
    }
    return rows;
  }

  /** Updates every match. A plain object is treated as $set. Returns the number of matched documents. */
  async update(filter, update, { session } = {}) {
    const r = await this.col.updateMany(filter, isOperatorUpdate(update) ? update : { $set: update }, { session });
    return r.matchedCount;
  }

  /** Updates one match and returns it as it is afterwards, or null when nothing matched. */
  updateOne(filter, update, { session, upsert = false, sort } = {}) {
    return this.col.findOneAndUpdate(filter, isOperatorUpdate(update) ? update : { $set: update }, { session, upsert, sort, returnDocument: 'after', projection: NO_ID });
  }

  /** Inserts the document (with defaults) unless one matching `filter` exists. Returns true when inserted. */
  async insertIfAbsent(filter, doc, { session } = {}) {
    // Fields in the filter are copied into the new document by the server, so they must not be set twice.
    const fields = Object.fromEntries(Object.entries(this.build(doc)).filter(([k]) => !(k in filter)));
    const r = await this.col.updateOne(filter, { $setOnInsert: fields }, { session, upsert: true });
    return r.upsertedCount > 0;
  }

  async delete(filter, { session } = {}) {
    return (await this.col.deleteMany(filter, { session })).deletedCount;
  }

  deleteOne(filter, { session } = {}) {
    return this.col.findOneAndDelete(filter, { session, projection: NO_ID });
  }

  aggregate(pipeline, { session } = {}) {
    return this.col.aggregate(pipeline, { session }).toArray();
  }
}

export const db = Object.fromEntries(Object.entries(MODELS).map(([key, def]) => [key, new Model(def.name, def)]));

let txSupport = null;
async function supportsTransactions() {
  if (txSupport === null) {
    const hello = await database.admin().command({ hello: 1 });
    txSupport = Boolean(hello.setName || hello.msg === 'isdbgrid');
  }
  return txSupport;
}

/**
 * Runs fn(session) in a multi-document transaction, retried automatically on write conflicts.
 * On a standalone server (no replica set) transactions are unavailable, so fn runs without one; the
 * conditional updates used for stock and coupons still prevent overselling, but a failure part-way
 * through is not rolled back. Use a replica set (npm run db:start does) or Atlas in production.
 */
export async function withTx(fn) {
  if (!(await supportsTransactions())) return fn(undefined);
  const session = mongo.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally {
    await session.endSession();
  }
}

export const ping = () => database.command({ ping: 1 });
export const closeDb = () => mongo.close();
