import { Command } from '@oclif/command';
import encoding from 'encoding-down';
import memdown from 'memdown';
import levelup from 'levelup';
import batching from '../leveldown/batch';
import { wrap } from '../leveldown';
import { ENDstr } from '../leveldown/indexing';
import { getAllDocsHash } from '../cli/content';
import * as models from '../common/models';
// TODO find a stemmer that works, the ones in natural are not good enough
import { WordTokenizer } from 'natural';
import { eachSeries } from 'async';

export default class Search extends Command {
  public async run() {
    const tokenizer = new WordTokenizer();
    const batched = batching<any, string>(
      levelup(encoding<string, any>(memdown(), { valueEncoding: 'json' }))
    );
    const db = wrap(batched.db);
    const topics = db.subIndexed<models.Payload>('topics')({
      terms: ({ topic: p }) => {
        return [p.text || [], p.title || []]
          .flat()
          .flatMap(s => tokenizer.tokenize(s.toLowerCase()))
          .filter(s => s.length > 3 && s.match(/^[a-z]+$/))
      },
    });

    const allDocs = await getAllDocsHash();
    await eachSeries(Object.keys(allDocs), async k => {
      await topics.put(k, allDocs[k]);
    });
    await batched.write();

    let term: string = '';
    await topics.idx.terms.indexDb.forEach({ limit: 1, gte: `m`, lt: `m${ENDstr}` }, (k, v) => {
      term = k.split('!')[0];
    });

    console.log(term);
  }
}
