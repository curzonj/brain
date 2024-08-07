import * as fs from 'fs';
import xdgBasedir from 'xdg-basedir';
import { codeStorageVersion } from '../common/leveldb';

// const base = '/home/curzonj/data'; // xdgBasedir.data || xdgBasedir.config
// const datadir = `${base}/kbase`;
const datadir = '/data/kbase';

const exportDir = `${datadir}/exports`;

export const config = JSON.parse(
  fs.readFileSync(`${datadir}/sync.json`, 'utf8')
);

export const expressPouchDBConfig = `${datadir}/pouch_db.json`;

export function getDatabasePath() {
  const dir = `${datadir}/pouchdb`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getLevelDbPath() {
  const dir = `${datadir}/leveldb/${codeStorageVersion}`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function exportFile(filename: string, contents: string) {
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  fs.writeFileSync(`${exportDir}/${filename}`, contents);
}

export function readExport(filename: string): string | undefined {
  if (!fs.existsSync(exportDir)) {
    return;
  }
  return fs.readFileSync(`${exportDir}/${filename}`).toString('utf8');
}
