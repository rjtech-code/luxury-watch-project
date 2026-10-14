import { execFileSync } from 'node:child_process';
import { MongoClient } from 'mongodb';

const uri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/luxwatch_test?replicaSet=rs0';

export default async function setup() {
  const client = new MongoClient(uri);
  const dbName = client.db().databaseName;
  if (!/test/i.test(dbName)) throw new Error(`Refusing to reset "${dbName}": test database names must contain "test".`);
  await client.db().dropDatabase();
  await client.close();

  const env = { ...process.env, MONGODB_URI: uri, NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40) };
  execFileSync('node', ['src/db/seed.js'], { env, stdio: 'pipe' });
}
