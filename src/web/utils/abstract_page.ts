import { getTopic, getNotes, getReverseMappings } from './data';
import * as models from '../../common/models';
import { reportError, annotateErrors } from '../../common/errors';

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
  text?: string;
  list?: TextObject[];
  divs?: Div[];
}

export interface Div {
  heading: string;
  list?: TextObject[];
}

export async function getPageTitle(topicId: string): Promise<string> {
  if (!topicId.startsWith('/')) {
    topicId = `/${topicId}`;
  }

  const doc = await getTopic(topicId).catch(e => reportError(e, { topicId }));
  if (!doc) {
    return topicId;
  } else {
    return deriveTitle(doc);
  }
}

export async function buildAbstractPage(
  topicId: string
): Promise<AbstractPage> {
  if (!topicId.startsWith('/')) {
    topicId = `/${topicId}`;
  }

  const doc = await getTopic(topicId).catch(e => reportError(e, { topicId }));
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

  return annotateErrors({ doc }, async () => {
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
  });
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
        const sectionDoc = await getTopic(s);
        if (!sectionDoc) {
          return { text: `Missing ${s}` };
        }
        return topicSection(sectionDoc);
      }

      return {
        text: s,
      };
    })
  );
}

async function topicSection(doc: models.Doc): Promise<Section> {
  return annotateErrors({ doc }, async () => {
    return {
      title: deriveTitle(doc),
      text: doc.text,
      list: await maybeLabelRefs(doc.list),
      divs: await listFieldNameDivs(NestedSectionListFieldNames, doc),
    } as Section;
  });
}

async function listFieldNameDivs(
  names: string[][],
  doc: models.Doc
): Promise<Div[]> {
  const p = await Promise.all(
    names.map(
      async ([field, heading]): Promise<Div[]> => {
        if (!doc[field]) return [];
        return [
          {
            heading,
            list: await maybeLabelRefs(doc[field] as any[]),
          },
        ];
      }
    )
  );

  return p.flat();
}

async function appendQueueToPage(doc: models.Doc) {
  const notes = await getNotes(doc.id);
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

  const backrefs = await getReverseMappings(doc.id).then(list =>
    Promise.all(list.map(topicToTextObject))
  );
  const divs = await listFieldNameDivs(LastSectionListFieldNames, doc);
  if (divs.length === 0 && backrefs.length === 0) {
    return [];
  }

  divs.unshift({
    heading: 'Backrefs',
    list: backrefs,
  });

  return {
    divs,
  };
}

async function maybeLabelRefs(
  list: undefined | any[]
): Promise<undefined | TextObject[]> {
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

async function refToTextObject(topicId: string): Promise<TextObject> {
  const topic = await getTopic(topicId);
  if (!topic) {
    return `Missing ${topicId}`;
  } else {
    return topicToTextObject(topic);
  }
}

type TextObject =
  | { ref: string; label?: string; text?: string; src?: any }
  | string;
async function topicToTextObject(topic: models.Doc): Promise<TextObject> {
  if (topic.title) {
    return {
      ref: topic.id,
      label: deriveTitle(topic),
    };
  } else if (!topic.text) {
    return {
      ref: topic.id,
      label: deriveTitle(topic),
    };
  } else {
    return {
      ref: topic.id,
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
    const srcNode = await getTopic(src);
    if (!srcNode) {
      return `Missing ${src}`;
    }
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
