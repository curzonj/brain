import * as models from '../common/models';
import { buildReverseMappings } from './content';
import { ComplexError } from '../common/errors';

type Rewriter = (
  d: models.Existing,
  opts: SetupObject
) => models.Update[] | models.Update | undefined | void;
interface RewriterSet {
  [key: string]: Rewriter;
}

export interface SetupObject {
  allDocs: models.Map<models.Existing>;
  reverse: models.Map<models.Payload[]>;
}
export async function setupRewriters(
  allDocs: models.Map<models.Existing>
): Promise<SetupObject> {
  return {
    allDocs,
    reverse: buildReverseMappings(allDocs),
  };
}

type SlicedField<T extends string> = { [key in T]?: models.Ref[] };
function filterField<F extends string>(
  src: F,
  dest: F,
  topic: SlicedField<F>,
  matcher: (r: models.Ref) => boolean
) {
  const list: undefined | models.Ref[] = topic[src];
  if (!list) return;
  const newSrc: models.Ref[] = list.filter(r => !matcher(r));
  const newDest: models.Ref[] = list.filter(matcher);
  if (newSrc.length === 0) {
    delete topic[src];
  } else {
    topic[src] = newSrc;
  }
  if (newDest.length > 0) {
    const currentDest: undefined | models.Ref[] = topic[dest];
    if (!currentDest) {
      topic[dest] = newDest;
    } else {
      newDest
        .filter(r => !models.hasRef(currentDest, r))
        .forEach(r => currentDest.push(r));
    }
  }
}

export const rewriters: RewriterSet = {};

/*
 * The fields are gone now so these don't compile, but they are good reference material
 *
  validateTodoLists(doc, { allDocs, reverse }) {
    const todoListRefs = [doc.topic.next, doc.topic.later]
      .flat()
      .filter(models.isRef)
      .map(d => d.ref)
      .sort();
    if (todoListRefs.length === 0) return;
    const reverseTodos = reverse[doc.metadata.id].filter(d =>
      models.hasRef(d.topic.actionOn, doc)
    );
    const reverseRefs = reverseTodos.map(d => d.metadata.id).sort();
    let mismatch = todoListRefs.length !== reverseRefs.length;
    if (mismatch) {
      console.dir({
        todoListLength: todoListRefs.length,
        reverseLength: reverseRefs.length,
      });
    }
    for (let i = 0; i < todoListRefs.length; i++) {
      if (todoListRefs[i] !== reverseRefs[i]) {
        mismatch = true;
        console.dir({
          todoList: todoListRefs[i],
          reverse: reverseRefs[i],
        });
      }
    }
    if (mismatch) {
      console.log(`mismatch on ${doc.topic.title}`);
    } else {
      delete doc.topic.next;
      delete doc.topic.later;
    }
  },
  updateActionRefs(doc, { reverse }) {
    const { topic, metadata } = doc;
    const actionOn: undefined | models.Payload = (
      reverse[metadata.id] || []
    ).find(rdoc =>
      [rdoc.topic.next, rdoc.topic.later]
        .flat()
        .filter(models.isRef)
        .some(ref => ref.ref === metadata.id)
    );
    if (!actionOn) {
      if (topic.actionOn) {
        metadata.stale_at = Date.now();
      }
      return;
    }
    filterField<'related' | 'actionOn'>(
      'related',
      'actionOn',
      topic,
      ref => actionOn.metadata.id === ref.ref
    );
    filterField<'broader' | 'actionOn'>(
      'broader',
      'actionOn',
      topic,
      ref => actionOn.metadata.id === ref.ref
    );
    if (!models.hasRef(topic.actionOn, actionOn.metadata.id)) {
      const newActionRef = { ref: actionOn.metadata.id };
      if (topic.actionOn) {
        topic.actionOn.push(newActionRef);
      } else {
        topic.actionOn = [newActionRef];
      }
    }
    const todoList = [actionOn.topic.next, actionOn.topic.later]
      .flat()
      .filter(models.isRef);
    const todoListRefObj = todoList.find(r => r.ref === metadata.id);
    if (!todoListRefObj)
      throw new ComplexError('failed to find position', {
        todoList,
        metadata,
      });
    const position = todoList.indexOf(todoListRefObj);
    if (position === -1)
      throw new ComplexError('failed to find position', {
        todoList,
        metadata,
        todoListRefObj,
      });
    if (position === 0) metadata.firstAction = true;
    const nextAction = todoList[position + 1];
    if (nextAction) metadata.nextAction = nextAction;
  },
relatedToBroader(doc, { allDocs }) {
  if (!doc.related) return;
  const isBroader = (r: models.Ref) => {
    const target = allDocs[r.ref];
    if (!target) return;
    const list = target.narrower;
    if (!Array.isArray(list)) return;
    return list.some(n => n.ref === doc.id);
  };

  const newRelated = doc.related.filter(r => !isBroader(r));
  const newBroader = doc.related.filter(r => isBroader(r));

  if (newRelated.length > 0) {
    doc.related = newRelated;
  } else {
    delete doc.related;
  }

  if (newBroader.length > 0)
    doc.broader = newBroader.concat(doc.broader || []);

  return doc;
},
resetID(doc) {
  let docId = doc.id;
  if (docId.startsWith('/')) docId = doc.id.slice(1);
  const expected = topicToDocID(docId);
  if (doc._id === expected && docId === doc.id) return;
  return [
    {
      ...omit(doc, ['_id', 'id', '_rev']),
      _id: expected,
      id: docId,
    } as models.DocUpdate,
    { ...doc, _deleted: true },
  ];
},
stripSlashes(doc) {
  Object.keys(doc).forEach((k: string) => {
    const value = doc[k];
    if (!value) return;
    if (typeof value === 'string') {
      if (value.startsWith('/')) doc[k] = value.slice(1);
    } else if (models.isRef(value) && value.ref.startsWith('/')) {
      doc[k] = { ref: value.ref.slice(1) };
    } else if (Array.isArray(value)) {
      doc[k] = (value as any[]).map((v: any) => {
        if (typeof v === 'string' && v.startsWith('/')) {
          return v.slice(1);
        } else if (models.isRef(v) && v.ref.startsWith('/')) {
          return { ref: v.ref.slice(1) };
        } else {
          return v;
        }
      });
    }
  });

  return doc;
},
rebuildRefs(doc, { allDocs }) {
  Object.keys(doc).forEach((k: string) => {
    if (k === 'id' || k === 'text') return;
    const value = doc[k];
    if (!value) return;
    if (typeof value === 'string') {
      if (value.startsWith('/') && allDocs[value] !== undefined)
        doc[k] = { ref: value };
    } else if (Array.isArray(value)) {
      doc[k] = (value as any[]).map((v: any) => {
        if (
          typeof v === 'string' &&
          v.startsWith('/') &&
          allDocs[v] !== undefined
        ) {
          return { ref: v };
        } else {
          return v;
        }
      });
    }
  });

  return doc;
},
relatedToBroader(doc, { allDocs }) {
  if (doc.title || doc.broader || doc.link || doc.src) return;
  if (!doc.related) throw new Error('invalid doc');
  const broader = doc.related.filter(r => allDocs[r] && allDocs[r].title);
  const related = doc.related.filter(r => broader.indexOf(r) === -1);
  if (broader.length > 0) doc.broader = broader;
  if (related.length === 0) {
    delete doc.related;
  } else {
    doc.related = related;
  }
  return doc;
},
linkNodes(doc) {
  if (!doc.links) return;
  if (!doc.links.some(models.isLabeledLink)) return;
  const newLinkDocs = doc.links.filter(models.isLabeledLink).map(l => {
    const id = generateID();
    return {
      _id: topicToDocID(id),
      id,
      title: l.title,
      link: l.link,
    };
  });
  const newLinks = [
    doc.links.filter(l => !models.isLabeledLink),
    newLinkDocs.map(d => d.id),
  ].flat();
  doc.links = newLinks;
  return [doc, newLinkDocs].flat();
},
uniqueRelated(doc, allDocs) {
  if (!doc.related) return;
  if (!doc.next && !doc.list && !doc.later) return;
  const newRelated = doc.related.filter(id => {
    if (
      ['list', 'next', 'later'].some(
        f => doc[f] && (doc[f] as string[]).indexOf(id) > -1
      )
    )
      return false;
    return true;
  });

  if (doc.id === '/568a081ac19e58cab5e82fcb50f399d6') {
    console.dir(doc.related);
    console.dir(newRelated);
  }
  if (deepEqual(doc.related.sort(), newRelated.sort())) return;

  doc.related = newRelated;
  return doc;
},
fixQueues(doc, allDocs) {
  if (doc.stale_at !== undefined || !doc.text || !doc.related) return;
  const newRelated = [
    doc.related.filter(id => {
      const target = allDocs[id];
      if (!target) return false;
      if (id === '/inbox' && doc.related && doc.related.length > 1)
        return false;
      return true;
    }),
    Object.keys(allDocs).filter(k => {
      const target = allDocs[k];
      if (
        ['queue', 'list', 'next', 'later'].some(
          f => target[f] && (target[f] as string[]).indexOf(doc.id) > -1
        )
      )
        return true;
      if (target.src && target.src === doc.id) return true;
      return false;
    }),
  ]
    .flat()
    .filter((v, i, s) => s.indexOf(v) === i);

  if (deepEqual(doc.related.sort(), newRelated.sort())) return;

  doc.related = newRelated;
  return doc;
},
reconcileCreatedAt(doc) {
  if (doc.created_at && doc.text === undefined) {
    delete doc.created_at;
    return doc;
  }
},
removeIdSlashes(doc) {
  function replace(item: string) {
    if (!item.startsWith('/')) return item;
    if (item.match(/^\/[a-zA-Z0-9-_.]+$/)) return item;
    return `/${hash(item.slice(1))}`;
  }

  function inner(field: string) {
    const list: any = doc[field];
    if (!Array.isArray(list)) return;
    doc[field] = (list as string[]).map(replace);
  }
  ['queue', 'next', 'later', 'list', 'related'].forEach(inner);

  if (doc.src && typeof doc.src === 'string') doc.src = replace(doc.src);
  if (doc.props && doc.props.author) {
    const related = (doc.related = doc.related || []);
    related.push(replace(doc.props.author));
    delete doc.props;
  }

  const newId = replace(doc.id);
  if (newId === doc.id) {
    return doc;
  }

  const newDoc = {
    ...doc,
    id: newId,
    _id: topicToDocID(newId),
  } as models.DocUpdate;
  delete newDoc._rev;

  return [newDoc, { ...doc, _deleted: true } as models.DocUpdate];
},
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
unstackLists(d, allDocs, original) {
  const updates: models.DocUpdate[] = [d];
  unstackNestedDocuments(d, updates);

  if (deepEqual(original, d)) return;

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
