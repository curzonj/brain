import { Command } from '@oclif/command';
import { ENDstr } from '../leveldown/indexing';
import * as models from '../common/models';
import { leveldb } from '../cli/leveldb';

export default class Search extends Command {
  public async run() {
    let term = '';
    await leveldb.topics.idx.terms.indexDb.forEach(
      { limit: 1, gte: `m`, lt: `m${ENDstr}` },
      (k, v) => {
        term = k.split('!')[0];
      }
    );

    console.log(term);
  }
}
