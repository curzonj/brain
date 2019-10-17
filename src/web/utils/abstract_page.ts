import {
  getTopic,
  getNotes,
  getReverseMappings,
  loading as dataLoading,
} from './data';
import * as models from '../../common/models';
import { annotateErrors } from '../../common/errors';

const NestedSectionListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
  ['related', 'Related'],
  ['links', 'Links'],
];

const TodoListFieldNames = [['next', 'Next'], ['later', 'Later']];

export interface AbstractPage {
  title: string;
  sections: Section[];
}

export interface Section {
  title?: string;
  text?: string;
  src?: any;
  divs?: Div[];
}

export interface Div {
  heading?: string;
  list: TextObject[];
}

const sectionFunctions = [frontSection, listSections, otherFieldsSection] as ((
  d: models.Doc
) => Section | Section[])[];
export async function buildAbstractPage(
  topicId: string,
  cb: (p: AbstractPage) => void,
  progressiveRender: boolean = true
): Promise<void> {
  if (!topicId.startsWith('/')) {
    topicId = `/${topicId}`;
  }

  const doc = await getTopic(topicId);
  if (!doc) {
    return cb({
      title: topicId,
      sections: [
        {
          text: 'No such topic',
        },
      ],
    });
  }

  const reloadWhenDone = dataLoading.isPending();

  await annotateErrors({ doc }, async () => {
    const page = {
      title: deriveTitle(doc),
      sections: [] as Section[],
    };
    if (progressiveRender) cb(page);

    await sectionFunctions.reduce(async (acc, fn) => {
      await acc;
      const sections = [await fn(doc)].flat();
      sections.forEach(s => page.sections.push(s));

      if (progressiveRender) cb(page);
    }, Promise.resolve());

    if (!progressiveRender) cb(page);
  });

  if (reloadWhenDone)
    await dataLoading.then(() => buildAbstractPage(topicId, cb, false));
}

async function frontSection(doc: models.Doc): Promise<Section | never[]> {
  const divs = [
    await maybeListDiv(isFullNodeList(doc.list) ? undefined : doc.list),
    await listFieldNameDivs(TodoListFieldNames, doc),
  ].flat();

  if (!doc.text && divs.length === 0) return [];

  return {
    text: doc.text,
    src: doc.src,
    divs,
  };
}

async function listSections(doc: models.Doc): Promise<Section[]> {
  if (isFullNodeList(doc.list)) {
    return Promise.all(
      doc.list.map(async (s: any) => {
        if (typeof s === 'string' && s.startsWith('/')) {
          const sectionDoc = await getTopic(s);
          if (!sectionDoc) {
            return { text: `Missing ${s}` };
          }
          return topicSection(sectionDoc, s => s === doc.id);
        }

        return {
          text: s,
        };
      })
    );
  } else {
    return [];
  }
}

async function topicSection(doc: models.Doc, context: LinkSilencer) {
  return annotateErrors(
    { doc },
    async (): Promise<Section> => {
      return {
        title: deriveTitle(doc),
        text: doc.text,
        divs: [
          await maybeListDiv(doc.list),
          await listFieldNameDivs(NestedSectionListFieldNames, doc, context),
        ].flat(),
      };
    }
  );
}

async function maybeListDiv(input: undefined | any[]): Promise<Div | never[]> {
  const list = await maybeLabelRefs(input);
  return list ? { list } : [];
}

async function listFieldNameDivs(
  names: string[][],
  doc: models.Doc,
  context?: LinkSilencer
): Promise<Div[]> {
  return (await Promise.all(
    names.map(
      async ([field, heading]): Promise<Div | never[]> => {
        const list = await maybeLabelRefs(doc[field] as any[], context);
        return list ? { heading, list } : [];
      }
    )
  )).flat();
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

function textObjectString(to: TextObject): string {
  if (typeof to === 'string') {
    return to;
  } else {
    return to.ref;
  }
}

async function buildRelatedDivList(
  doc: models.Doc
): Promise<{ related: TextObject[]; queue: TextObject[] }> {
  const list: TextObject[] = [];

  function append(fieldList: TextObject[] | undefined) {
    if (!fieldList) {
      return;
    }

    fieldList.forEach(r => {
      if (
        !list.find(li => textObjectString(li) === textObjectString(r)) &&
        textObjectString(r) !== doc.id
      ) {
        list.push(r);
      }
    });
  }

  await Promise.all(
    ['related', 'queue'].map(async field => {
      append(await maybeLabelRefs(doc[field] as any));
    })
  );

  await getReverseMappings(doc.id).then(async list =>
    append(await Promise.all(list.map(topicToTextObject)))
  );

  function textObjectSorter(a: TextObject, b: TextObject) {
    const aS = textObjectString(a);
    const bS = textObjectString(b);
    if (aS < bS) {
      return -1;
    }
    if (aS > bS) {
      return 1;
    }
    return 0;
  }

  const queue = list.filter(
    t => typeof t === 'string' || (t as any).text !== undefined
  );
  const related = list
    .filter(t => typeof t !== 'string' && (t as any).text === undefined)
    .sort(textObjectSorter);

  return { related, queue };
}

async function otherFieldsSection(doc: models.Doc) {
  await appendQueueToPage(doc);

  const { related, queue } = await buildRelatedDivList(doc);
  const links = await maybeLabelRefs(doc.links);
  const divs = [
    { heading: 'Related', list: related },
    { heading: 'Links', list: links },
    { heading: 'Queue', list: queue },
  ].filter(d => d.list && d.list.length > 0);

  if (divs.length === 0) return [];

  return { divs };
}

type LinkSilencer = (s: string) => boolean;
async function maybeLabelRefs(
  list: undefined | any[],
  silencer?: LinkSilencer
): Promise<undefined | TextObject[]> {
  if (!list || list.length === 0) return;

  const ret = (await Promise.all(
    list.map(async v => {
      // v could be an object from links
      if (typeof v === 'string' && v.startsWith('/')) {
        if (silencer && silencer(v)) {
          return [];
        }

        return refToTextObject(v);
      }

      return v;
    })
  )).flat();

  if (ret.length > 0) return ret;
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

  let title = n.title;

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

function isFullNodeList(list: undefined | string[]): list is string[] {
  return (
    list !== undefined &&
    list.every(s => typeof s === 'string' && s.startsWith('/'))
  );
}
