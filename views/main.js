const html = require('choo/html');
const raw = require('choo/html/raw');
const css = require('sheetify');

const body = require('../lib/layout');
const withMenu = require('../lib/menu');

module.exports = body(withMenu(menuItems, view));

function menuItems(state, emit) {
  const link = `#add_note/${state.params.wildcard}`;
  return html`
    <li><a href="#/index">index</a></li>
    <li><a href=${link}>add note</a></li>
  `;
}

const ListFieldNames = [
  ['next', 'Next'],
  ['later', 'Later'],
  ['related', 'Related'],
  ['mentions', 'Mentions'],
  ['stories', 'Stories'],
  ['links', 'Links'],
];

const topCss = css`
  @media screen and (min-width: 800px) {
    :host section {
      margin: 5px;
      box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.3);
      border: 1px solid #ffffff;
      padding: 30px 30px 30px 30px;
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

  :host section p {
    margin-block-end: 0;
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

function view(state, emit) {
  const key = state.loadedFor;
  const doc = state.pages[key];

  if (!key) {
    return section(p('Loading...'));
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

      ${renderTODOs(doc)} ${renderFrontSection(doc)} ${renderSections(doc.list)}
      ${renderOtherFieldsSection(doc)}
    </div>
  `;

  function breadcrumbs() {
    if (!doc.context || doc.context.length === 0) return undefined;
    const titleList = doc.contextPaths
      .map(p2 => state.pages[p2])
      .map(deriveTitle);
    const titleListHtml = titleList.flatMap((t, i) => [
      refLink(doc.contextPaths[i], t, 'refBreadcrumb'),
      raw('&gt;'),
    ]);

    return html`
      <span>${titleListHtml}</span>
    `;
  }

  function deriveTitle(n) {
    if (!n) return 'Missing Page';
    return n.title || n.type || n.join || n.link || 'Note';
  }

  function subtitle() {
    return null;
    /*
    return html`
      <span class="subtitle">${text}</span>
    `;
    */
  }

  function renderOtherFieldsSection(doc2) {
    if (
      !doc2.mentions &&
      !doc2.stories &&
      !doc2.related &&
      !doc2.links &&
      !doc2.queue
    )
      return undefined;

    // TODO src, props

    return section(html`
      ${maybe(doc2.related, sectionDivFn('Related'))}
      ${maybe(doc2.mentions, sectionDivFn('Mentions'))}
      ${maybe(doc2.stories, sectionDivFn('Stories'))}
      ${maybe(doc2.links, sectionDivFn('Links'))}
      ${maybe(doc2.queue, sectionDivFn('Queue'))}
    `);
  }

  function renderTODOs(doc2) {
    if (!doc2.next && !doc2.later) return undefined;

    return section(html`
      <h2 class="title">TODO</h2>
      ${maybe(doc2.next, sectionDivFn('Next'))}
      ${maybe(doc2.later, sectionDivFn('Later'))}
    `);
  }

  function renderFrontSection(doc2) {
    const { list } = doc2;
    const isShallow = listIsShallow(list);

    if (!doc2.text && !isShallow) {
      return undefined;
    }

    const shallowListContent = isShallow && simpleList(doc2.list);

    return section(html`
      ${maybe(doc2.text, p)} ${shallowListContent}
    `);
  }

  function listIsShallow(list) {
    return list && list.every(s => typeof s === 'string' && !s.startsWith('/'));
  }

  function renderSections(list) {
    if (!list || listIsShallow(list)) {
      return undefined;
    }

    return list
      .map(
        s => (typeof s === 'string' && s.startsWith('/') && state.pages[s]) || s
      )
      .map(renderSection);
  }

  function eachListField(doc2, fn) {
    return ListFieldNames.map(([field, text]) => {
      return maybe(doc2[field], fn(text));
    });
  }

  function renderSection(doc2) {
    if (typeof doc2 === 'string') {
      return section(renderTextItem(doc2));
    }

    return section(html`
      ${maybe(getTitle(doc2), h2title)} ${maybe(doc2.text, p)}
      ${maybe(doc2.list, renderSectionNodeDivs)}
      ${eachListField(doc2, sectionDivFn)}
    `);
  }

  function h2title(t) {
    return html`
      <h2 class="title">${t}</h2>
    `;
  }

  function renderSectionNodeDivs(list) {
    if (list.every(s => s.id && s.id.startsWith && s.id.starts('/'))) {
      return list.map(renderSectionNodeDiv);
    }
    return simpleList(list);
  }

  function sectionDivFn(heading) {
    return list => renderSectionDiv(list, heading);
  }

  // TODO get the listDD styling applied here
  function simpleList(list) {
    const item = li =>
      html`
        <li>${renderTextItem(li)}</li>
      `;
    return html`
      <ul>
        ${list.flatMap(item)}
      </ul>
    `;
  }

  function renderSectionDiv(list, heading) {
    function h3title(v) {
      return html`
        <h3 class="title">${v}</h3>
      `;
    }

    return html`
      <div>
        ${maybe(heading, h3title)} ${simpleList(list)}
      </div>
    `;
  }

  function renderSectionNodeDiv(node) {
    return renderSectionDiv(node.list, getTitle(node));
  }

  function renderTextItem(item) {
    if (typeof item === 'string') {
      if (item.startsWith('/')) {
        return renderRef({ ref: item });
      }
      if (item.startsWith('http')) {
        return buildAnchorElement(item);
      }
      return p(item);
    }
    if (item.ref) {
      return renderRef(item);
    }
    if (item.link || item.search) {
      return buildAnchorElement(item);
    }
    if (item.title) {
      return refLink(item.id, item.title);
    }

    if (!item.text) {
      return refLink(item.id, 'Unknown');
    }

    return html`
      <p>
        ${item.text} ${renderSrc(item)} ${renderMoreRef(item)}
      </p>
    `;
  }

  function renderSrc(node) {
    if (!node.src) return undefined;
    if (typeof node.src === 'string') {
      return html`
        - ${renderTextItem(node.src)}
      `;
    }
    return html`
      <pre>${JSON.stringify(node.src)}</pre>
    `;
  }

  function renderMoreRef(node) {
    if (node.id) {
      return html`
        (${refLink(node.id, 'more', 'moreLink')})
      `;
    }

    return undefined;
  }

  function renderRef({ ref, label }) {
    if (label) return refLink(ref, label);
    if (!state.pages[ref]) return refLink(ref);

    return renderTextItem(state.pages[ref]);
  }

  function buildAnchorElement(obj) {
    const mobile = document.documentElement.clientWidth < 800;

    if (typeof obj === 'string' || obj.link) {
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
          .filter(l => l && l !== '')
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
    }
    if (obj.search) {
      return html`
        <a
          target="_blank"
          href="https://google.com/search?q=${encodeURIComponent(obj.search)}"
          >Google: ${obj.search}</a
        >
      `;
    }

    return undefined;
  }

  function maybe(v, f) {
    if (v) {
      return f(v);
    }
    return undefined;
  }

  function refLink(link, text, cssClass = 'refLink') {
    return html`
      <a class=${cssClass} href="#${encodeURI(link)}">${text || link}</a>
    `;
  }

  function section(inner) {
    return html`
      <section>${inner}</section>
    `;
  }

  function p(v) {
    return html`
      <p>${v}</p>
    `;
  }

  function getTitle(doc2) {
    const title = doc2.title || doc2.type || doc2.join || doc2.link;
    if (title && typeof title !== 'string') {
      console.log(title);
      console.log(doc2);
      throw new Error(`Not a string: ${title.toString()}`);
    }

    return title;
  }

  function renderMissing(key2) {
    return html`
      <div class=${topCss}>
        <h1 class="title">${key2}</h1>

        <section>
          <p>This page does not have any content yet.</p>
        </section>
      </div>
    `;
  }
}
