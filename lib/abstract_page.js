const db = require('../lib/db');

const NestedSectionListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
  ['related', 'Related'],
  ['mentions', 'Mentions'],
  ['links', 'Links'],
];

const LastSectionListFieldNames = [
  ['related', 'Related'],
  ['mentions', 'Mentions'],
  ['links', 'Links'],
  ['queue', 'Queue'],
];

const TodoListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
]

module.exports = {
  async buildAbstractPage(topicId) {
    const doc = await db.getTopic(topicId).catch(console.log);
    if (!doc) {
      return {
        title: topicId,
        sections: [{
          text: "This page does not have any content yet.",
        }]
      }
    }

    const sections = await Promise.all([
      todoSection(doc),
      frontSection(doc),
      listSections(doc),
      otherFieldsSection(doc),
    ])

    return {
      title: deriveTitle(doc),
      breadcrumbs: await breadcrumbs(doc),
      sections: sections.flat(),
    };
  },
}

async function todoSection(doc) {
  const divs = await listFieldNameDivs(TodoListFieldNames, doc)
  if (divs.length === 0) {
    return [];
  }

  return {
    title: "TODO",
    divs,
  }
}

async function frontSection(doc) {
  const { list } = doc;
  const isShallow = listIsShallow(list);

  if (!doc.text && !isShallow) {
    return [];
  }

  return {
    // TODO src, props
    text: doc.text,
    list: await maybeLabelRefs(isShallow && doc.list),
  }
}

function listSections({ list }) {
  if (!list || listIsShallow(list)) {
    return [];
  }

  return Promise.all(list.map(async s => {
    if (typeof s !== 'string' || !s.startsWith('/')) {
      return {
        text: s
      }
    }

    const doc = await db.getTopic(s);
    return topicSection(doc);
  }));
}

async function topicSection(doc) {
  return {
    title: deriveTitle(doc),
    text: doc.text,
    list: await maybeLabelRefs(doc.list),
    divs: await listFieldNameDivs(NestedSectionListFieldNames, doc),
  }
}

async function listFieldNameDivs(names, doc) {
  const p = await Promise.all(names.map(async ([field, heading]) => {
    if (!doc[field]) return [];
    return [{
      heading,
      list: await maybeLabelRefs(doc[field]),
    }];
  }))

  return p.flat();
}

async function appendQueueToPage(doc) {
  const notes = await db.getNotes(doc.id);
  if (notes.length === 0) {
    return;
  }

  if (!doc.queue) {
    doc.queue = [];
  }

  notes.forEach(item => {
    doc.queue.unshift(item);
  });
}

async function otherFieldsSection(doc) {
  await appendQueueToPage(doc);

  const divs = await listFieldNameDivs(LastSectionListFieldNames, doc)
  if (divs.length === 0) {
    return [];
  }

  return {
    divs,
  }
}

function maybeLabelRefs(list) {
  if (!list) return

  return Promise.all(list.map(async v => {
    // v could be an object from links
    if (typeof v === "string" && v.startsWith('/')) {
      return refToTextObject(v)
    }

    return v;
  }))
}

async function refToTextObject(topicId) {
  const topic = await db.getTopic(topicId)
  if (topic.title) {
    return {
      ref: topicId,
      label: deriveTitle(topic),
    }
  } else if (!topic.text) {
    return {
      ref: topicId,
      label: deriveTitle(topic),
    }
  } else {
    return {
      ref: topicId,
      text: topic.text,
      src: await maybeResolveSrc(topic.src),
    }
  }
}

// could be lots of things
async function maybeResolveSrc(src) {
  if (!src) return undefined;
  if (typeof src !== 'string') {
    return src
  } else if (src.startsWith('/')) {
    const srcNode = await db.getTopic(src)
    return {
      ref: src,
      label: deriveTitle(srcNode),
    }
  } else {
    return src
  }
}

function deriveTitle(n) {
  if (!n) return 'Missing Page';
  return n.title || n.type || n.join || n.link || 'Note';
}

function listIsShallow(list) {
  return list && list.every(s => typeof s === 'string' && !s.startsWith('/'));
}

async function breadcrumbs(doc) {
  if (!doc.context || doc.context.length === 0) return undefined;
  if (typeof doc.context.map !== 'function') {
    console.log(doc.context);
  }

  const contextPaths = doc.context.map(
    (v, i) => `/${[...doc.context].slice(0, i + 1).join('/')}`
  );

  return maybeLabelRefs(contextPaths);
}
