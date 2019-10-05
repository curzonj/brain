import leveljs from 'level-js';
import encoding from 'encoding-down';
import levelup from 'levelup';
import { wrap } from '../../leveldown';
import batching from '../../leveldown/batch';
import * as models from '../../common/models';

const batched = batching<any, string>(
  levelup(encoding<string, any>(leveljs('wiki'), { valueEncoding: 'id' }))
);
const base = wrap(batched.db);

export const namespaces = {
  write: batched.write,
  topics: base.subIndexed<models.Doc>('topics')({
    queue: (d: models.Doc) => {
      if (!d.queue) return;
      return d.queue.map(q => [q, d._id].join('!'));
    },
    list: (d: models.Doc) => {
      if (!d.list) return;
      return d.list
        .filter(l => l.startsWith('/'))
        .map(q => [q, d._id].join('!'));
    },
  }),
  configs: base.sub<any>('configs'),
  notes: base.sub<models.NewNote>('notes'),
};
