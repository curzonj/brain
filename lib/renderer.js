const html = require('choo/html');
const raw = require('nanohtml/raw');
const css = require('sheetify');
const yaml = require('js-yaml');
const assert = require('assert');

module.exports = renderDoc;

const topCss = css`
  :host {

  }

  @media screen and (min-width: 960px) {
    :host section {
      padding: 28px 42px 42px 42px;
      width: 686px;
      border-radius: 2px;
    }
  }

  @media screen and (max-width: 960px) {
    :host section {
      padding: 14px 14px 14px 14px;
    }
  }

  :host section {
    margin: 5px;
    box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.3);
    background-color: #ffffff;
    border: 1px solid #ffffff;
  }

  :host .title {
    display: block;

    line-height: 1.2;
    font-weight: 300;

    color: #182955;
  }

  :host h1.title {
    font-size: 2.35em;
  }

  :host h2.title {
    font-size: 1.65em;
  }

  :host h3.title {
    font-size: 1.15em;
  }
`;

function renderDoc(doc) {
  delete doc._id;
  delete doc._rev;

  return html`
    <div class=${topCss}>
      <h1 class="title">${heading(doc)}</h1>
      ${renderList(doc.todo, renderText, 'TODO')}

      <hr />
      ${doc.sections && doc.sections.flatMap(renderSection)}

      <dl>
        ${rawKeys(doc).map(k => dtJSON(doc, k))}
      </dl>

      <hr/>
      ${renderRelated(doc)} ${renderList(doc.links, li => link(li))}
      ${renderList(doc.thoughts, renderText, 'Thoughts')}
    </div>
  `;
}

function renderSection(doc) {
  return html`
    <section>
      <h2 class="title">${heading(doc)}</h2>
      ${renderList(doc.topics, renderTopic)} ${renderList(doc.list, renderText)}

      <dl>
        ${rawKeys(doc).map(k => dtJSON(doc, k))}
      </dl>

      ${renderRelated(doc)} ${renderList(doc.links, li => link(li))}
      ${renderList(doc.thoughts, renderText, 'Thoughts')}
    </section>
  `;
}

function renderRelated(doc) {
  if (!doc.related) {
    return;
  }

  const list = typeof doc.related === 'string' ? [doc.related] : doc.related;

  return renderList(list, anchor, 'Related');
}

function renderText(li) {
  if (typeof li === 'string') {
    return li;
  }
  return JSON.stringify(li);
}

function renderTopic(li) {
  if (typeof li === 'string') {
    return anchor(li);
  }
  return JSON.stringify(li);
}

function renderList(list, fn, heading) {
  if (!list) {
    return;
  }

  assert.equal(
    typeof list.flatMap,
    'function',
    JSON.stringify({
      error: 'not a list',
      value: list,
    })
  );

  function item(li) {
    return html`
      <li>${fn(li)}</li>
    `;
  }

  function maybeHeading() {
    if (heading)
      return html`
        <h3 class="title">${heading}</h3>
      `;
  }

  return html`
    ${maybeHeading()}
    <ul>
      ${list.flatMap(item)}
    </ul>
  `;
}

function listField(doc, field, fn) {
  return onlyIf(doc, field, l => renderList(l, fn));
}

function onlyIf(doc, field, fn) {
  const v = doc[field];
  if (!v) return;

  return html`
    <dt>${field}</dt>
    <dd>${fn(v)}</dd>
  `;
}

function rawKeys(doc) {
  const formattedKeys = [
    'what',
    'list_of',
    'related',
    'links',
    'sections',
    'list',
    'topics',
    'thoughts',
    'about',
    'todo',
  ];
  return Object.keys(doc).filter(k => formattedKeys.indexOf(k) === -1);
}

function dtJSON(doc, field) {
  const v = doc[field];

  if (v.flatMap) {
    return listField(doc, field, li => JSON.stringify(li));
  }

  return html`
    <dt>${field}</dt>
    <dd>${JSON.stringify(doc[field])}</dd>
  `;
}

function heading(doc) {
  if (doc.what) return doc.what;
  if (doc.about) return doc.about;
  if (doc.list_of) return `list of ${doc.list_of}`;
}

function link(l) {
  if (typeof l === "string") {
    return html`
      <a target="_blank" href="${l}">${l}</a>
    `;
  }

  return JSON.stringify(l)
}

function anchor(l) {
  return html`
    <a href="#${encodeURI(l)}">${l}</a>
  `;
}

function convertLinks(doc) {
  if (doc.links) {
    doc.links = doc.links.flatMap(l => {
      if (typeof l === 'string') {
        return link(l);
      }

      if (l.link) {
        l.link = link(l.link);
      }

      if (l.search && !l.site) {
        l.search = `<a target="_blank" href="https://google.com/search?q=${encodeURIComponent(
          l.search
        )}">${l.search}</a>`;
      }

      return l;
    });
  }
}

function convertThought(doc) {
  convertLinks(doc);
  convertRelated(doc);
  if (doc.more) doc.more.forEach(convertThought);

  if (!doc.src) return;

  if (typeof doc.src === 'string') {
    if (!doc.src.startsWith('http')) return;
    doc.src = link(doc.src);
  } else if (doc.src.link) {
    doc.src.link = link(doc.src.link);
  }
}
