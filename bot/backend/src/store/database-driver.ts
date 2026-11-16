/** SQLite remains the store; this binding adds authenticated database encryption. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3-multiple-ciphers";

export type DatabaseSync = Database.Database;
type Schema = { type: string; name: string; sql: string };
type Column = { name: string; hidden: number };
const header = Buffer.from("SQLite format 3\0");

function isPlain(file: string): boolean {
  if (!fs.existsSync(file) || fs.statSync(file).size < header.length) return false;
  const bytes = Buffer.alloc(header.length), fd = fs.openSync(file, "r");
  try { return fs.readSync(fd, bytes, 0, bytes.length, 0) === bytes.length && bytes.equals(header); }
  finally { fs.closeSync(fd); }
}
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

function applyKey(db: DatabaseSync, key: Buffer): void {
  if (key.length !== 32) throw new Error("Invalid Bot database key");
  db.pragma("cipher = 'chacha20'");
  if (db.key(key) !== 0) throw new Error("Bot database key initialization failed");
  // Setting a key alone does not authenticate an existing database.
  db.prepare("SELECT COUNT(*) FROM sqlite_master").get();
}

/** The original remains intact until the encrypted staging database is verified and closed. */
function migratePlaintext(file: string, key: Buffer, onMigration?: () => void): void {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Bot database encryption cannot replace a symlink");
  onMigration?.();
  const staging = file + ".cipher-" + randomUUID() + ".tmp";
  let source: DatabaseSync | undefined, target: DatabaseSync | undefined;
  try {
    source = new Database(file, { timeout: 5000, fileMustExist: true });
    source.defaultSafeIntegers(true);
    const checkpoint = source.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number | bigint }>;
    if (checkpoint.some(row => Number(row.busy) !== 0)) throw new Error("Close other Bot database readers before encryption");
    source.pragma("locking_mode = EXCLUSIVE");
    const mode = source.pragma("journal_mode = DELETE", { simple: true });
    if (String(mode).toLowerCase() !== "delete") throw new Error("Bot database could not enter exclusive migration mode");
    source.exec("BEGIN EXCLUSIVE");
    fs.closeSync(fs.openSync(staging, "wx", 0o600));
    target = new Database(staging, { timeout: 5000 });
    applyKey(target, key);
    target.pragma("foreign_keys = OFF");
    target.pragma("temp_store = MEMORY");
    target.exec("BEGIN IMMEDIATE");
    const schema = source.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Schema[];
    const tables = schema.filter(row => row.type === "table");
    if (tables.some(row => /CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql))) throw new Error("Virtual tables require an explicit Bot encryption migration adapter");
    for (const table of tables) {
      target.exec(table.sql);
      const columns = (source.pragma(`table_xinfo(${identifier(table.name)})`) as Column[]).filter(column => Number(column.hidden) === 0).map(column => column.name);
      const tableFlags = source.prepare("SELECT wr FROM pragma_table_list WHERE schema='main' AND name=?").get(table.name) as { wr: number | bigint };
      const rowid = ["rowid", "_rowid_", "oid"].find(name => !columns.some(column => column.toLowerCase() === name));
      if (!Number(tableFlags.wr) && rowid) columns.unshift(rowid);
      const names = columns.map(identifier).join(",");
      const insert = target.prepare(`INSERT INTO ${identifier(table.name)} (${names}) VALUES (${columns.map(() => "?").join(",")})`);
      for (const row of source.prepare(`SELECT ${names} FROM ${identifier(table.name)}`).raw().iterate() as Iterable<unknown[]>) insert.run(...row);
    }
    if (source.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
      for (const row of source.prepare("SELECT name, seq FROM sqlite_sequence").all() as Array<{ name: string; seq: bigint }>) {
        if (!target.prepare("UPDATE sqlite_sequence SET seq=? WHERE name=?").run(row.seq, row.name).changes)
          target.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES (?,?)").run(row.name, row.seq);
      }
    }
    for (const row of schema.filter(row => row.type !== "table")) target.exec(row.sql);
    for (const name of ["user_version", "application_id"]) {
      const value = Number(source.pragma(name, { simple: true }));
      target.pragma(`${name} = ${value}`);
    }
    target.exec("COMMIT");
    if (target.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Encrypted Bot database failed integrity validation");
    for (const table of tables) {
      const query = `SELECT COUNT(*) AS count FROM ${identifier(table.name)}`;
      const before = source.prepare(query).get() as { count: bigint };
      const after = target.prepare(query).get() as { count: number };
      if (BigInt(before.count) !== BigInt(after.count)) throw new Error("Encrypted Bot database row counts differ");
    }
    target.close(); target = undefined;
    source.exec("COMMIT"); source.close(); source = undefined;
    const fd = fs.openSync(staging, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(staging, file);
  } finally {
    if (target?.open) target.close();
    if (source?.open) source.close();
    // Only this invocation's same-directory staging files are eligible for cleanup.
    if (path.resolve(path.dirname(staging)) !== path.resolve(path.dirname(file)) || !staging.startsWith(file + ".cipher-"))
      throw new Error("Invalid Bot encryption staging path");
    for (const suffix of ["", "-journal", "-wal", "-shm"]) fs.rmSync(staging + suffix, { force: true });
  }
}

export function openDatabase(file: string, key?: Buffer, onMigration?: () => void): DatabaseSync {
  if (key && key.length !== 32) throw new Error("Invalid Bot database key");
  if (key && file !== ":memory:" && isPlain(file)) migratePlaintext(file, key, onMigration);
  const db = new Database(file, { timeout: 5000 });
  try {
    if (key) applyKey(db, key);
    else db.prepare("SELECT COUNT(*) FROM sqlite_master").get();
    db.pragma("temp_store = MEMORY");
    db.pragma("synchronous = NORMAL");
    return db;
  } catch (error) {
    db.close();
    throw new Error("Bot database decryption or integrity check failed", { cause: error });
  }
}
