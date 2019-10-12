import * as models from '../common/models';
import { AllDocsHash } from './content';

type Rewriter = (
  d: models.DocUpdate,
  docs: AllDocsHash,
  original: models.ExistingDoc
) => models.DocUpdate[] | models.DocUpdate | undefined;
interface RewriterSet {
  [key: string]: Rewriter;
}

export const rewriters: RewriterSet = {
  restoreRelated(d, allDocs) {
    if (d.title || d.related) return;

    const result = Object.values(allDocs)
      .filter(other =>
        ['next', 'later', 'list', 'related', 'queue'].some(
          field => other[field] && (other[field] as string[]).indexOf(d.id) > -1
        )
      )
      .map(d => d.id);

    if (result.length > 0) {
      d.related = result;
      return d;
    }
  },
};

/*
 * The fields are gone now so these don't compile, but they are good reference material
 *
unstackLists(d, allDocs, original) {
  const updates: models.DocUpdate[] = [d];
  unstackNestedDocuments(d, updates);

  if (deepEqual(original, d)) return;

  generatePatches(original, d);

  return updates;
},
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
