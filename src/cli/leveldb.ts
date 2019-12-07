import leveldown from 'leveldown';
import memdown from 'memdown';
import { buildLevelDB, isTestEnv } from '../common/leveldb';
import { getLevelDbPath } from './paths';

const leveljsStore = isTestEnv() ? memdown() : leveldown(getLevelDbPath());
export const leveldb = buildLevelDB(leveljsStore);
