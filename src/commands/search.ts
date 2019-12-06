import { Command } from '@oclif/command';
import { ENDstr } from '../leveldown/indexing';
import { getAllDocsHash } from '../cli/content';
import * as models from '../common/models';
import { eachSeries } from 'async';
import { topics, write } from '../common/leveldb';

export default class Search extends Command {
  public async run() {
    /*
    const allDocs = await getAllDocsHash();
    await eachSeries(Object.keys(allDocs), async k => {
      await topics.put(k, allDocs[k]);
    });
    await write();
     */

    let term: string = '';
    await topics.idx.terms.indexDb.forEach({ limit: 1, gte: `m`, lt: `m${ENDstr}` }, (k, v) => {
      term = k.split('!')[0];
    });

    console.log(term);
  }
}
