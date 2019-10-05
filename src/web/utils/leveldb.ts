import leveljs from 'level-js';
import { LevelWrapper } from '../../leveldown';
import * as models from '../../common/models';

const base = new LevelWrapper(leveljs('wiki'));

export const namespaces = {
  async write() {
    /*
    return new Promise((resolve, reject) =>
      base.write(err => (err ? reject(err) : resolve()))
    );
     */
  },
  topics: base.sub<models.Doc>('topics'),
  configs: base.sub<any>('configs'),
  notes: base.sub<models.NewNote>('notes'),
};
