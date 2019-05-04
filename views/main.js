const html = require('choo/html');
const css = require('sheetify');
const yaml = require('js-yaml');
const assert = require('assert');

const body = require('../lib/layout')
const withMenu = require('../lib/menu')


module.exports = body(withMenu(menuItems, view));

const missingLinkCss = css`
  :host {
    font-style: italic;
    font-weight: 300;
    text-decoration: none;
    color: #5778d8;
  }
`;

const topCss = css`
  :host {

  }

  @media screen and (min-width: 800px) {
    :host section {
      margin: 5px;
      box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.3);
      border: 1px solid #ffffff;
      padding: 28px 42px 42px 42px;
      border-radius: 2px;
    }
  }

  @media screen and (max-width: 800px) {
    :host section {
      padding: 14px;
    }
  }

  :host span.subtitle {
    font-size: 0.9em;
    color: #c0c0c0;
    font-weight: 300;
  }

  :host ul {
    margin-block-start: 14px;
    margin-block-end: 0px;
  }

  :host li {
    padding-bottom: 0.4em;
  }

  :host section {
    margin-bottom: 16px;
    background-color: #ffffff;
  }

  :host .title {
    display: block;

    line-height: 1.2;
    font-weight: 300;

    color: #182955;
  }

  :host div.header {
    margin: 1em;
  }

  :host h1.title {
    font-size: 1.65em;
    margin: 0;
  }

  :host h2.title {
    font-size: 1.45em;
    margin-block-start: 0px;
    margin-block-end: 14px;
  }

  :host h3.title {
    font-size: 1em;
    font-weight: 200;
    margin-block-start: 14px;
    margin-block-end: 14px;
  }

  :host dd.listDD {
    margin-inline-start: 0px;
  }
`;

function renderMissing(key) {
  return html`
    <div class=${topCss}>
      <h1 class="title">${key}</h1>

      <section>
        <p>This page does not have any content yet.</p>
      </section>
    </div>
  `;
}

function menuItems(state, emit) {
  return html`
    <li><a href="#index">index</a></li>
    <li><a href="#add_note">add note</a></li>
    <li><a href="#" onclick=${onclickSync}>sync</a></li>
  `;

  function onclickSync(e) {
    e.preventDefault();
    emit(state.events.pouchdb_sync)
  }
}

const titleThreshold = 30;
function view(state, emit) {
  if (state.loading) {
    return html`<span>Loading...</span>`;
  }

  const key = state.params.doc_id
  const doc = state.pages[key];

  if (!doc) {
    return renderMissing(key)
  }

  const docKeys = Object.keys(doc)
  if (Object.keys(doc).length === 3) {
    return renderMissing(heading(doc))
  }

  return html`
    <div class=${topCss}>
      <div class="header">
        <h1 class="title">${deriveTitle()}</h1>
        ${subtitle()}
      </div>

      ${renderNotes(doc)}

      ${doc.sections && doc.sections.flatMap(renderSection)}
    </div>
  `;

  function deriveTitle() {
    const str = heading(doc)
    console.log(str.length)
    if (doc.subtitle) return str
    if (str.length > titleThreshold && str.length > doc._id.length) return doc._id.replace(/-/g, ' ')
    return str
  }
  function subtitle() {
    const str = heading(doc)
    let text

    if (doc.subtitle) text = doc.subtitle;
    if (str.length > titleThreshold && str.length > doc._id.length) text = str

    if (text) {
      return html`<span class="subtitle">${text}</span>`
    }
  }

  function renderNotes(doc) {
    if (!doc.todo && !doc.links && !doc.thoughts && !doc.related) {
      return
    }

    return html`
      <section>
        ${title()}
        ${renderList(doc.todo, renderText, 'TODO')}

        ${dt(doc)}

        ${renderRelated(doc)} ${renderList(doc.links, li => link(li), "Links")}
        ${renderList(doc.thoughts, renderText, 'Thoughts')}
      </section>
    `

    function title() {
      if (doc.sections) return html`<h2 class="title">Notes</h2>`;
    }
  }

  function renderSection(doc) {
    return html`
      <section>
        <h2 class="title">${heading(doc)}</h2>
        ${renderList(doc.topics, renderTopic)} ${renderList(doc.list, renderText)}

        ${dt(doc)}

        ${renderRelated(doc)} ${renderList(doc.links, li => link(li), "Links")}
        ${renderList(doc.thoughts, renderText, 'Thoughts')}
      </section>
    `;
  }

  function dt(doc) {
    const list = rawKeys(doc)
    if (list.length === 0) return
    return html`
      <dl>
        ${list.map(k => dtJSON(doc, k))}
      </dl>
    `;
  }

  function renderRelated(doc) {
    if (!doc.related) {
      return;
    }

    if (!doc.what && !doc.about && !doc.list_of && typeof doc.related === "string") {
      return
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
      <dd className=${v.flatMap ? 'listDD' : ''}>${fn(v)}</dd>
    `;
  }

  function rawKeys(doc) {
    const formattedKeys = [
      '_id',
      '_rev',
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
      return listField(doc, field, li => renderText(li));
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
    if (typeof doc.related == "string") {
      return anchor(doc.related)
    }
    return doc._id.replace(/-/g, ' ')
  }

  function link(l) {
    const mobile = (document.documentElement.clientWidth < 800);
    if (typeof l === "string") {
      let target = l
      let text = l


      if (l.startsWith("https://en.wikipedia.org/wiki")) {
        text = "Wikipedia: "+text.replace("https://en.wikipedia.org/wiki/", "").replace(/_/g, ' ')
      } else if (l.indexOf("pinboard.in/u:curzonj/") !== -1) {
        text = "Pinboard: "+(text.replace(/https?:\/\/pinboard.in\/u:curzonj\//, "").
                             split("/").flatMap(l => l.replace(/^t:/, '')).
                             join(", ")
                            )
        target = target.replace(/^http:\/\//, "https://")
        if (mobile) {
          target = target.replace("pinboard.in", "m.pinboard.in")
        }
      }

      return html`
        <a target="_blank" href="${target}">${text}</a>
      `;
    }

    return JSON.stringify(l)
  }

  function anchor(l) {
    if(!state.pages[l]) {
      return html`<span class=${missingLinkCss}>${l}</span>`;
    }

    return html`<a href="#${encodeURI(l)}">${l}</a>`;
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
}
