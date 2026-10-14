/**
 * Starts a local MongoDB for development as a single-node replica set (transactions need a replica set),
 * with its data in server/.mongo-data. Safe to run repeatedly: does nothing if it is already up.
 *
 *   npm run db:start          start (needs `mongod` on PATH, or MONGOD_BIN=/path/to/mongod)
 *   npm run db:stop           stop
 *
 * Using MongoDB Atlas or another server instead? Skip this and set MONGODB_URI in server/.env.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, '.mongo-data');
const port = Number(process.env.MONGO_PORT ?? 27017);
const bin = process.env.MONGOD_BIN ?? 'mongod';
const direct = `mongodb://127.0.0.1:${port}/?directConnection=true&serverSelectionTimeoutMS=1500`;

async function ping() {
  const c = new MongoClient(direct);
  try {
    await c.connect();
    await c.db('admin').command({ ping: 1 });
    return c;
  } catch {
    await c.close().catch(() => {});
    return null;
  }
}

if (process.argv.includes('--stop')) {
  const c = await ping();
  if (!c) {
    console.log('MongoDB is not running.');
  } else {
    await c.db('admin').command({ shutdown: 1 }).catch(() => {}); // the connection drops as the server stops
    console.log('MongoDB stopped.');
  }
  process.exit(0);
}

let client = await ping();
if (!client) {
  fs.mkdirSync(dbPath, { recursive: true });
  const r = spawnSync(bin, ['--dbpath', dbPath, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'rs0', '--fork', '--logpath', path.join(dbPath, 'mongod.log')], { stdio: 'inherit' });
  if (r.error?.code === 'ENOENT') {
    console.error(`Could not find "${bin}". Install MongoDB 7+ (https://www.mongodb.com/try/download/community) or set MONGOD_BIN.`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
  for (let i = 0; i < 30 && !client; i++) {
    await new Promise((ok) => setTimeout(ok, 500));
    client = await ping();
  }
  if (!client) {
    console.error(`MongoDB did not start. See ${path.join(dbPath, 'mongod.log')}.`);
    process.exit(1);
  }
}

const admin = client.db('admin');
try {
  await admin.command({ replSetGetStatus: 1 });
} catch (err) {
  if (err.codeName !== 'NotYetInitialized') throw err;
  await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
}
for (let i = 0; i < 40; i++) {
  if ((await admin.command({ hello: 1 })).isWritablePrimary) break;
  await new Promise((ok) => setTimeout(ok, 500));
}
await client.close();
console.log(`MongoDB ready: mongodb://127.0.0.1:${port}/luxwatch?replicaSet=rs0`);
