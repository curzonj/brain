import leveljs from 'level-js';
import { LevelWrapper } from '../../leveldown';
import batching from '../../leveldown/batch';
import * as models from '../../common/models';

const batched = batching(new LevelWrapper(leveljs('wiki')));
const base = new LevelWrapper(batched.db);

export const namespaces = {
  write: batched.write,
  topics: base.sub<models.Doc>('topics'),
  configs: base.sub<any>('configs'),
  notes: base.sub<models.NewNote>('notes'),
};
