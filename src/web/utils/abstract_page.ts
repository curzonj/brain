import * as db from './db';
import * as models from '../../common/models';
import { reportError } from './errors';

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

const TodoListFieldNames = [['next', 'Next'], ['later', 'Later']];

export interface AbstractPage {
  title: string;
  breadcrumbs?: any[];
  sections: Section[];
}

export interface Section {
  title?: string;
  text?: any;
  list?: any[];
  divs?: any[];
}

export async function buildAbstractPage(
  topicId: string
): Promise<AbstractPage> {
  const doc = await db.getTopic(topicId).catch(reportError);
  if (!doc) {
    return {
      title: topicId,
      sections: [
        {
          text: 'This page does not have any content yet.',
        },
      ],
    };
  }

  const sections = await Promise.all([
    todoSection(doc),
    frontSection(doc),
    listSections(doc),
    otherFieldsSection(doc),
  ]);

  return {
    title: deriveTitle(doc),
    breadcrumbs: await breadcrumbs(doc),
    sections: sections.flat(),
  };
}

async function todoSection(doc: models.Doc): Promise<Section | never[]> {
  const divs = await listFieldNameDivs(TodoListFieldNames, doc);
  if (divs.length === 0) {
    return [];
  }

  return {
    title: 'TODO',
    divs,
  };
}

async function frontSection(doc: models.Doc) {
  const { list } = doc;
  const isShallow = listIsShallow(list);

  if (!doc.text && !isShallow) {
    return [];
  }

  return {
    // TODO src, props
    text: doc.text,
    list: await maybeLabelRefs(isShallow ? undefined : doc.list),
  } as Section;
}

async function listSections(doc: models.Doc): Promise<Section[]> {
  const { list } = doc;
  if (!list || listIsShallow(list)) {
    return [];
  }

  return Promise.all(
    list.map(async (s: any) => {
      if (typeof s === 'string' && s.startsWith('/')) {
        const sectionDoc = await db.getTopic(s);
        return topicSection(sectionDoc);
      }

      return {
        text: s,
      };
    })
  );
}

async function topicSection(doc: models.Doc): Promise<Section> {
  return {
    title: deriveTitle(doc),
    text: doc.text,
    list: await maybeLabelRefs(doc.list),
    divs: await listFieldNameDivs(NestedSectionListFieldNames, doc),
  } as Section;
}

async function listFieldNameDivs(names: string[][], doc: models.Doc) {
  const p = await Promise.all(
    names.map(async ([field, heading]) => {
      if (!doc[field]) return [];
      return [
        {
          heading,
          list: await maybeLabelRefs(doc[field] as any[]),
        },
      ];
    })
  );

  return p.flat();
}

async function appendQueueToPage(doc: models.Doc) {
  const notes = await db.getNotes(doc.id);
  if (notes.length === 0) {
    return;
  }

  notes.forEach(item => {
    doc.queue = doc.queue || [];
    doc.queue.unshift(item);
  });
}

async function otherFieldsSection(doc: models.Doc) {
  await appendQueueToPage(doc);

  const divs = await listFieldNameDivs(LastSectionListFieldNames, doc);
  if (divs.length === 0) {
    return [];
  }

  return {
    divs,
  };
}

async function maybeLabelRefs(
  list: undefined | any[]
): Promise<undefined | any[]> {
  if (!list || list.length === 0) return;

  return Promise.all(
    list.map(async v => {
      // v could be an object from links
      if (typeof v === 'string' && v.startsWith('/')) {
        return refToTextObject(v);
      }

      return v;
    })
  );
}

async function refToTextObject(topicId: string) {
  const topic = await db.getTopic(topicId);
  if (topic.title) {
    return {
      ref: topicId,
      label: deriveTitle(topic),
    };
  } else if (!topic.text) {
    return {
      ref: topicId,
      label: deriveTitle(topic),
    };
  } else {
    return {
      ref: topicId,
      text: topic.text,
      src: await maybeResolveSrc(topic.src),
    };
  }
}

// could be lots of things
async function maybeResolveSrc(src: undefined | models.Link) {
  if (!src) return;
  if (typeof src !== 'string') {
    return src;
  } else if (src.startsWith('/')) {
    const srcNode = await db.getTopic(src);
    return {
      ref: src,
      label: deriveTitle(srcNode),
    };
  } else {
    return src;
  }
}

function deriveTitle(n: models.Doc): string {
  if (!n) return 'Missing Page';

  let title = n.title || n.join;

  if (!title && n.link) {
    if (typeof n.link === 'string') {
      title = n.link;
    } else if (models.isLabeledLink(n.link)) {
      title = n.link.link;
    } else if (models.isSearchLink(n.link)) {
      title = n.link.search;
    }
  }

  return title || 'Note';
}

function listIsShallow(list: undefined | any[]): boolean {
  return (
    list !== undefined &&
    list.every(s => typeof s === 'string' && !s.startsWith('/'))
  );
}

async function breadcrumbs(doc: models.Doc) {
  if (!doc.context) return undefined;

  // This dates back to the deeply nested path style keys used
  // as contexts
  const fragments: string[] = doc.context.split('/').slice(1);
  const contextPaths = fragments.map(
    (fragment, index) => `/${fragments.slice(0, index + 1).join('/')}`
  );

  return maybeLabelRefs(contextPaths);
}
