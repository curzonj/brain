import {
  getTopic,
  getNotes,
  getReverseMappings,
  loading as dataLoading,
} from './data';
import * as models from '../../common/models';
import { annotateErrors } from '../../common/errors';

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
    await maybeListDiv(doc.collection),
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
  if (doc.narrower) {
    return Promise.all(
      doc.narrower.map(async (s: any) => {
        const sectionDoc = await getTopic(s.ref);
        if (!sectionDoc) {
          return { text: `Missing ${s}` };
        }
        return topicSection(sectionDoc, s => s === doc.id);
      })
    );
  } else {
    return [];
  }
}

const NestedSectionListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
  ['broader', 'Broader'],
  ['related', 'Related'],
  ['links', 'Links'],
];
async function topicSection(doc: models.Doc, context: LinkSilencer) {
  return annotateErrors(
    { doc },
    async (): Promise<Section> => {
      return {
        title: deriveTitle(doc),
        text: doc.text,
        divs: [
          await maybeListDiv(doc.narrower || doc.collection),
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

async function buildRelatedDivList(
  doc: models.Doc
): Promise<{ related: TextObject[]; notes: TextObject[] }> {
  const list = [await getNotes(doc.id), await getReverseMappings(doc)].flat();

  const notes: TextObject[] = await Promise.all(
    list
      .filter(t => t.title === undefined)
      .sort((a, b) => {
        if (!a.created_at || !b.created_at)
          throw new Error('note missing created_at during sort');
        if (a.created_at > b.created_at) return -1;
        if (a.created_at < b.created_at) return 1;
        return 0;
      })
      .map(topicToTextObject)
  );

  let related: TextObject[] = await Promise.all(
    list.filter(t => t.title !== undefined).map(topicToTextObject)
  );

  if (doc.related) {
    (await Promise.all(doc.related.map(refToTextObject))).flat().forEach(to => {
      if (!related.some(rto => rto.ref === to.ref)) {
        related.unshift(to);
      }
    });
  }

  if (doc.broader) {
    (await Promise.all(doc.broader.map(refToTextObject))).flat().forEach(to => {
      if (!related.some(rto => rto.ref === to.ref)) {
        related.unshift(to);
      }
    });
  }

  related = related.sort((a, b) => {
    if (!a.ref) return -1;
    if (!b.ref) return 1;
    if (a.ref < b.ref) return -1;
    if (a.ref > b.ref) return 1;
    return 0;
  });

  return { related, notes };
}

async function otherFieldsSection(doc: models.Doc) {
  const { related, notes } = await buildRelatedDivList(doc);
  const divs = [
    { heading: 'Related', list: related },
    { heading: 'Links', list: await maybeLabelRefs(doc.links) },
    { heading: 'Notes', list: notes },
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
      if (!models.isRef(v)) return v;
      if (silencer && silencer(v.ref)) return [];
      return refToTextObject(v);
    })
  )).flat();

  if (ret.length > 0) return ret;
}

async function refToTextObject(ref: models.Ref): Promise<TextObject | never[]> {
  const topic = await getTopic(ref.ref);
  if (!topic) {
    return { text: `Missing ${ref.ref}` };
  } else if (topic.stale_at) {
    return [];
  } else {
    return topicToTextObject(topic);
  }
}

interface TextObject {
  ref?: string;
  label?: string;
  text?: string;
  src?: any;
}
async function topicToTextObject(
  topic: models.Note | models.Doc
): Promise<TextObject> {
  if (topic.title) {
    return {
      ref: topic.id,
      label: deriveTitle(topic as models.Doc),
    };
  } else if (!topic.text) {
    return {
      ref: topic.id,
      label: deriveTitle(topic as models.Doc),
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
  if (models.isRef(src)) {
    const srcNode = await getTopic(src.ref);
    if (!srcNode) {
      return `Missing ${src.ref}`;
    }
    return {
      ref: src.ref,
      label: deriveTitle(srcNode),
    };
  } else {
    return src;
  }
}

function deriveTitle(n: models.Doc): string {
  if (!n) return 'Missing Page';
  return n.title || n.link || 'Note';
}
