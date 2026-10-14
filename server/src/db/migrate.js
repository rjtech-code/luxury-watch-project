/** Creates every collection and its indexes. Idempotent: safe to run on every deploy. */
import { closeDb, database } from './client.js';
import { MODELS } from './models.js';

export async function migrate() {
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const def of Object.values(MODELS)) {
    if (!existing.has(def.name)) await database.createCollection(def.name);
    const indexes = [...(def.hasId === false ? [] : [{ key: { id: 1 }, unique: true }]), ...(def.indexes ?? [])];
    const seen = new Set();
    const unique = indexes.filter((ix) => {
      const k = JSON.stringify(ix.key);
      return !seen.has(k) && seen.add(k);
    });
    if (unique.length) await database.collection(def.name).createIndexes(unique);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  console.log('Collections and indexes are ready.');
  await closeDb();
}
