const html = require('choo/html');
const raw = require('choo/html/raw');
const css = require('sheetify');
const yaml = require('js-yaml');
const assert = require('assert');

const body = require('../lib/layout');
const withMenu = require('../lib/menu');

module.exports = body(withMenu(menuItems, view));

function menuItems(state, emit) {
  return html`
    <li><a href="#/index">index</a></li>
    <li><a href=${"#add_note/"+state.params.wildcard}>add note</a></li>
  `;
}

const NestedFieldNames = ['queue', 'next', 'later', 'stories', 'list']
const RefStringFields = [ ...NestedFieldNames, 'src', 'mentions', 'related' ]
const ListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
  ['related', 'Related'],
  ['mentions', 'Mentions'],
  ['stories', 'Stories'],
  ['links', 'Links'],
  ['queue', 'Queue'],
]

const missingLinkCss = css`
  :host {
    font-style: italic;
    font-weight: 300;
    text-decoration: none;
    color: #5778d8;
  }
`;

const topCss = css`
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

  :host .refBreadcrumb {
    font-size: 0.9em;
  }

  :host .refLink {
    font-size: 1.2em;
    margin-bottom: 0.6em;
    display: block;
  }

  :host ul {
    margin-block-start: 14px;
    margin-block-end: 0px;
  }

  :host li {
    margin-bottom: 0.4em;
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

const titleThreshold = 30;
function view(state, emit) {
  const key = state.loadedFor;
  const doc = state.pages[key];

  if (!key) {
    return section(p("Loading..."))
  }

  if (!doc || Object.keys(doc).length === 1) {
    return renderMissing(doc ? doc.title : key);
  }

  return html`
    <div class=${topCss}>
      <div class="header">
        ${breadcrumbs()}
        <h1 class="title">${deriveTitle(doc)}</h1>
        ${subtitle()}
      </div>

      ${renderTODOs(doc)}
      ${renderFrontSection(doc)}
      ${renderSections(doc.list)}
      ${renderOtherFieldsSection(doc)}
    </div>
  `;

  function breadcrumbs() {
    if (doc.context.length === 0) return;
    const titleList = doc.contextPaths.map(p => state.pages[p]).map(deriveTitle)
    const titleListHtml = titleList.flatMap((t,i) => [ refLink(doc.contextPaths[i], t, "refBreadcrumb"), raw("&gt;") ])

    return html`<span>${titleListHtml}</span>`;
  }

  function deriveTitle(n) {
    if (!n) return "Missing Page"
    return n.title || n.type || n.join || n.link || "Note";
  }

  function subtitle() {
    return null
    /*
    return html`
      <span class="subtitle">${text}</span>
    `;
    */
  }

  function renderOtherFieldsSection(doc) {
    if (!doc.mentions && !doc.stories && !doc.related && !doc.links && !doc.queue) return;

    // TODO src, props

    return section(html`
      ${maybe(doc.related, sectionDivFn("Related"))}
      ${maybe(doc.mentions, sectionDivFn("Mentions"))}
      ${maybe(doc.stories, sectionDivFn("Stories"))}
      ${maybe(doc.links, sectionDivFn("Links"))}
      ${maybe(doc.queue, sectionDivFn("Queue"))}
    `);
  }

  function renderTODOs(doc) {
    if (!doc.next && !doc.later) return;

    return section(html`
      <h2 class="title">TODO</h2>
      ${maybe(doc.next, sectionDivFn("Next"))}
      ${maybe(doc.later, sectionDivFn("Later"))}
    `);
  }

  function renderFrontSection(doc) {
    const list = doc.list
    const isShallow = listIsShallow(list)

    if (!doc.text && !isShallow) {
      return
    }

    const shallowListContent = isShallow && simpleList(doc.list)

    return section(html`
      ${maybe(doc.text, p)}
      ${shallowListContent}
    `);
  }

  function listIsShallow(list) {
    return list && list.every(s => typeof s === "string" && !s.startsWith("/"))
  }

  function renderSections(list) {
    if (!list || listIsShallow(list)) {
      return
    }

    return list.
      map(s => (typeof s === "string" && s.startsWith("/") && state.pages[s]) || s).
      map(renderSection)
  }

  function eachListField(doc, fn) {
    return ListFieldNames.map(([field, text]) => {
      return maybe(doc[field], fn(text))
    })
  }

  function renderSection(doc) {
    if (typeof doc === "string") {
      return section(renderTextItem(doc))
    }

    return section(html`
      <h2 class="title">${getTitle(doc)}</h2>
      ${maybe(doc.text, p)}
      ${maybe(doc.list, renderSectionNodeDivs)}
      ${eachListField(doc, sectionDivFn)}
    `);
  }

  function renderSectionNodeDivs(list) {
    if(list.every(s => s.id && s.id.startsWith && s.id.starts("/"))) {
      return list.map(renderSectionNodeDiv)
    } else {
      return simpleList(list)
    }
  }

  function sectionDivFn(heading) {
    return (list) => renderSectionDiv(list, heading)
  }

  // TODO get the listDD styling applied here
  function simpleList(list) {
    const item = li => html`<li>${renderTextItem(li)}</li>`;
    return html`<ul>${list.flatMap(item)}</ul>`;
  }

  function renderSectionDiv(list, heading) {
    function h3title(v) {
      return html`<h3 class="title">${v}</h3>`
    }

    return html`
      <div>
        ${maybe(heading, h3title)}
        ${simpleList(list)}
      </div>
    `;
  }

  function renderSectionNodeDiv(node) {
    return renderSectionDiv(
      node.list,
      getTitle(node))
  }

  function renderTextItem(item) {
    if (typeof item === "string") {
      if (item.startsWith("/")) {
        return renderRef({ ref: item })
      } else if (item.startsWith("http")) {
        return link(item)
      } else {
        return p(item)
      }
    } else if (item.ref) {
      return renderRef(item)
    } else if (item.link || item.search) {
      return link(item)
    } else {
      if (item.title) {
        return refLink(item.id, item.title)
      }

      return html`
        ${maybe(item.text, p)}
        ${maybe(item.mentions, simpleList)}
        ${renderSrc(item)}
        ${renderMoreRef(item)}
      `;
    }
  }

  function renderSrc(node) {
    if (!node.src) return
    if (typeof node.src === "string") {
      return html`src: ${renderTextItem(node.src)}`
    }
    return html`<pre>${JSON.stringify(node.src)}</pre>`;
  }

  function renderMoreRef(node) {
    if (node.id) return refLink(node.id, "more")
  }

  function renderRef({ ref, label }) {
    if (label) return refLink(ref, label)
    if (!state.pages[ref]) return refLink(ref)

    return renderTextItem(state.pages[ref])
  }

  function link(obj) {
    const mobile = document.documentElement.clientWidth < 800;

    if (typeof obj === "string" || obj.link) {
      let target = obj;
      let text = obj;

      if (typeof obj !== 'string') {
        target = obj.link;
        text = obj.title || obj.link;
      }

      if (text.startsWith('https://en.wikipedia.org/wiki')) {
        text = `Wikipedia: ${text
          .replace('https://en.wikipedia.org/wiki/', '')
          .replace(/_/g, ' ')}`;
      } else if (text.indexOf('pinboard.in/u:curzonj/') !== -1) {
        text = `Pinboard: ${text
          .replace(/https?:\/\/pinboard.in\/u:curzonj\//, '')
          .split('/')
          .filter(l => l && l !== "")
          .flatMap(l => l.replace(/^t:/, ''))
          .join(', ')}`;
        target = target.replace(/^http:\/\//, 'https://');
        if (mobile) {
          target = target.replace('pinboard.in', 'm.pinboard.in');
        }
      }

      return html`
        <a target="_blank" href="${target}">${text}</a>
      `;
    } else if (obj.search) {
      return html`
        <a
          target="_blank"
          href="https://google.com/search?q=${encodeURIComponent(obj.search)}"
          >Google: ${obj.search}</a
        >
      `;
    }
  }

  function maybe(v, f) {
    if (v) {
      return f(v)
    }
  }

  function refLink(link, text, cssClass="refLink") {
    return html`<a class=${cssClass} href="#${encodeURI(link)}">${text || link}</a>`;
  }

  function section(inner) {
    return html`<section>${inner}</section>`;
  }

  function p(v) {
    return html`<p>${v}</p>`;
  }

  function span(v) {
    return html`<span>${v}</p>`;
  }

  function getTitle(doc) {
    const title = doc.title || doc.type || doc.join || doc.link;
    if (title && typeof title !== 'string') {
      console.log(title)
      console.log(doc)
      throw("Not a string: "+title.toString())
    }

    return title
  }

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
}
