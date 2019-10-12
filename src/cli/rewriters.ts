import * as models from '../common/models';
import { AllDocsHash } from './content';

type Rewriter = (
  d: models.DocUpdate,
  docs: AllDocsHash
) => models.DocUpdate | undefined;
interface RewriterSet {
  [key: string]: Rewriter;
}

export const rewriters: RewriterSet = {};

/*
 * The fields are gone now so these don't compile, but they are good reference material
 *
removeMentions(d) {
  if (d.mentions) {
    const r = (d.related = d.related || []);
    d.mentions.forEach(m => r.push(m));
    delete d.mentions;
    return d;
  }
},
removeJoins(d, allDocs) {
  if (d.join) {
    const joinedDoc = allDocs[d.join];
    if (joinedDoc) {
      const title = joinedDoc.title;
      const r = (d.related = d.related || []);
      r.push(d.join);
      d.title = title;
    }

    delete d.join;
    return d;
  }
},
removeContext(d) {
  if (d.context) {
    const r = (d.related = d.related || []);
    if (r.indexOf(d.context) === -1) r.push(d.context);

    delete d.context;
    return d;
  }
},
 */
