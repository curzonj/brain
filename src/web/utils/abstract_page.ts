import { getTopic, getReverseMappings, loading as dataLoading } from './data';
import * as models from '../../common/models';
import { deriveTitle, buildBackrefs, Backrefs, refSorter } from '../../common/content';
import { annotateErrors } from '../../common/errors';

type FieldsAndHeadings = [models.TopicKeys, string][];
const NestedSectionListFieldNames: FieldsAndHeadings = [
  ['broader', 'Broader'],
  ['related', 'Related'],
  ['links', 'Links'],
];

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

const sectionFunctions: ((
  d: models.Payload,
  b: Backrefs,
) => Promise<Section | Section[]>)[] = [
  frontSection,
  listSections,
  otherFieldsSection,
];
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
    const page: AbstractPage = {
      title: deriveTitle(doc.topic),
      sections: [] as Section[],
    };
    if (progressiveRender) cb(page);

    const list = await getReverseMappings(doc);
    const bucketed = buildBackrefs(doc.metadata.id, list);

    await sectionFunctions.reduce(async (acc, fn) => {
      await acc;
      const sections = [await fn(doc, bucketed)].flat();
      sections.forEach(s => page.sections.push(s));

      if (progressiveRender) cb(page);
    }, Promise.resolve());

    if (!progressiveRender) cb(page);
  });

  if (reloadWhenDone)
    await dataLoading.then(() => buildAbstractPage(topicId, cb, false));
}

async function buildTasksDiv(
  bucketed: Backrefs,
): Promise<Div[]> {
  const list = await maybePayloadsToTextObjects(bucketed.tasks);
  if (list.length === 0) return [];
  return [{ heading: "Tasks", list }];
};

async function frontSection({
  topic,
}: models.Payload, backrefs: Backrefs): Promise<Section | never[]> {
  const divs = [
    await maybeListDiv(topic.collection),
    await buildTasksDiv(backrefs),
  ].flat();

  if (!topic.text && divs.length === 0) return [];

  return {
    text: topic.text,
    src: topic.src,
    divs,
  };
}

async function listSections({
  topic,
  metadata,
}: models.Payload): Promise<Section[]> {
  if (topic.narrower) {
    return Promise.all(
      topic.narrower.map(async s => {
        const sectionDoc = await getTopic(s.ref);
        if (!sectionDoc) {
          return { text: `Missing ${s.ref}` };
        }
        return topicSection(sectionDoc.topic, id => id === metadata.id);
      })
    );
  } else {
    return [];
  }
}

async function topicSection(doc: models.Topic, context: LinkSilencer) {
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
  names: FieldsAndHeadings,
  doc: models.Topic,
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

async function maybePayloadsToTextObjects(
  ...list: (models.Payload[] | undefined)[]
): Promise<TextObject[]> {
  return Promise.all(
    list
      .filter(l => Array.isArray(l))
      .flat()
      .map(topicToTextObject)
  );
}

async function maybeAddRefTextObjects(
  list: models.Ref[] | undefined,
  tos: TextObject[]
) {
  if (!list) return;
  (await Promise.all(list.map(refToTextObject))).flat().forEach(to => {
    if (!tos.some(rto => rto.ref === to.ref)) {
      tos.unshift(to);
    }
  });
}

async function buildRelatedDivList(
  doc: models.Payload,
  bucketed: Backrefs,
): Promise<{ related: TextObject[]; notes: TextObject[] }> {
  const notes = await maybePayloadsToTextObjects(
    bucketed.notes,
    bucketed.quotes
  );
  let related = await maybePayloadsToTextObjects(bucketed.backrefs);

  await maybeAddRefTextObjects(doc.topic.related, related);
  await maybeAddRefTextObjects(doc.topic.broader, related);

  related = related.sort(refSorter);

  return { related, notes };
}

async function otherFieldsSection(
  doc: models.Payload,
  backrefs: Backrefs
): Promise<Section | Section[]> {
  const { related, notes } = await buildRelatedDivList(doc, backrefs);
  const divs = [
    { heading: 'Related', list: related },
    { heading: 'Links', list: (await maybeLabelRefs(doc.topic.links)) || [] },
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
  const doc = await getTopic(ref.ref);
  if (!doc) {
    return { text: `Missing ${ref.ref}` };
  } else if (doc.metadata.stale_at) {
    return [];
  } else {
    return topicToTextObject(doc);
  }
}

interface TextObject {
  ref?: string;
  label?: string;
  text?: string;
  src?: any;
}
async function topicToTextObject({
  topic,
  metadata,
}: models.Payload): Promise<TextObject> {
  if (topic.title) {
    return {
      ref: metadata.id,
      label: deriveTitle(topic),
    };
  } else if (!topic.text) {
    return {
      ref: metadata.id,
      label: deriveTitle(topic),
    };
  } else {
    return {
      ref: metadata.id,
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
      label: deriveTitle(srcNode.topic),
    };
  } else {
    return src;
  }
}
