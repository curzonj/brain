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
  const doc = state.abstractPage;

  if (!key) {
    return section(p('Loading...'));
  }

  return html`
    <div class=${topCss}>
      <div class="header">
        ${maybe(doc.breadcrumbs, breadcrumbs)}
        <h1 class="title">${doc.title}</h1>
      </div>

      ${maybe(doc.sections, renderSections)}
    </div>
  `;
}

function breadcrumbs(list) {
  const titleListHtml = list.map(({ ref, label }) => [
    refLink(ref, label, 'refBreadcrumb'),
    raw('&gt;'),
  ]);

  return html`
    <span>${titleListHtml}</span>
  `;
}

function renderSections(list) {
  return list.map(s => section([
    maybe(s.title, h2title),
    maybe(s.text, p),
    maybe(s.list, simpleList),
    maybe(s.divs, sectionDivs),
  ]))
}

function sectionDivs(divs) {
  return divs.map(({ heading, list }) => {
    return html`
      <div>
        ${maybe(heading, h3title)}
        ${simpleList(list)}
      </div>
    `;
  })
}

function h2title(t) {
  return html`
    <h2 class="title">${t}</h2>
  `;
}

function h3title(v) {
  return html`
    <h3 class="title">${v}</h3>
  `;
}

function sectionDivFn({ heading, list }) {
  return html`
    <div>
      ${maybe(heading, h3title)}
      ${simpleList(list)}
    </div>
  `;
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

function renderTextItem(item) {
  if (typeof item === 'string') {
    if (item.startsWith('http')) {
      return buildAnchorElement(item);
    }
    return p(item);
  } else if (item.link || item.search) {
    return buildAnchorElement(item);
  } else if (item.label) {
    return refLink(item.ref, item.label);
  } else {
    return html`
      <p>
        ${item.text}
        ${renderSrc(item.src)}
        (${refLink(item.ref, 'more', 'moreLink')})
      </p>
    `;
  }
}

function renderSrc(src) {
  if (!src) {
    return undefined;
  } else if (typeof src === 'string') {
    return html`- ${src}`;
  } else if(src.ref) {
    return refLink(src.ref, src.label);
  } else {
    // TODO replace this, it could be a labeled link
    return html`
      <pre>${JSON.stringify(src)}</pre>
    `;
  }
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
