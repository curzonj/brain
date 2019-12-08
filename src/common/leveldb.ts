import encoding from 'encoding-down';
import levelup from 'levelup';
import { AbstractLevelDOWN } from 'abstract-leveldown';
import { WordTokenizer } from 'natural/lib/natural/tokenizers/regexp_tokenizer';
import { wrap, LevelWrapper } from '../leveldown';
import { Indexer } from '../leveldown/indexing';
import batching from '../leveldown/batch';
import * as models from './models';
import debug from './debug';

export const codeStorageVersion = 11;

const tokenizer = new WordTokenizer();

export interface LevelDB {
  write: () => Promise<void>;
  topics: LevelWrapper<
    models.Payload,
    {
      backrefs: Indexer<models.Payload>;
      terms: Indexer<models.Payload>;
    }
  >;
  configs: LevelWrapper<any, {}>;
  uploads: LevelWrapper<models.Create, {}>;
}
export function buildLevelDB(
  leveljsStore: AbstractLevelDOWN<any, any>
): LevelDB {
  const batched = batching<any, string>(
    levelup(encoding<string, any>(leveljsStore, { valueEncoding: 'json' }))
  );
  const base = wrap(batched.db);

  const write = async () => {
    debug.storage('batched.write at=start');
    await batched.write();
    debug.storage('batched.write at=finish');
  };

  const topics = base.subIndexed<models.Payload>('topics')({
    backrefs: p => {
      const refs = models.getAllRefs(p.topic).map(r => r.ref);
      return refs;
    },
    terms: ({ topic: p }) => {
      return [p.text || [], p.title || []]
        .flat()
        .flatMap(s => tokenizer.tokenize(s.toLowerCase()))
        .filter(s => s.length > 2 && s.match(/^[a-z]+$/));
    },
  });

  const uploads = base.sub<models.Create>('uploads');
  const configs = base.sub<any>('configs');

  return {
    write,
    topics,
    configs,
    uploads,
  };
}

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}
