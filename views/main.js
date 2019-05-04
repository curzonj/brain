const html = require('choo/html');
const css = require('sheetify');
const render = require('../lib/renderer');

const TITLE = 'brain';

module.exports = view;
function view(state, emit) {
  if (state.title !== TITLE) emit(state.events.DOMTITLECHANGE, TITLE);

  const bodyCss = css`
    :host {
      display: block;
      margin: 16px;

      font-size: 14px;
      line-height: 20px;
      word-wrap: break-word;
      color: #333333;
      background-color: #f4f4f4;
      fill: #333333;

      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
  `;

  if (!state.params.doc_id) {
    emit('replaceState', '#index');
    return html`
      <body class=${bodyCss}>
        <span>Redirecting ...</span>
      </body>
    `;
  }

  return html`
    <body class=${bodyCss}>
      ${menuBar()}
      ${renderOrLoading(state)}
    </body>
  `;

  function handleClick() {
    emit('clicks:add', 1);
  }
}

function menuBar() {
  const menuCss = css`
    :host {
      margin-top: 2px;
      float: right;
    }
  `;

  return html`
    <div class=${menuCss}>
      <a href="#index">index</a>
    </div>
    <div style="clear:both"></div>
  `;
}

function renderOrLoading(state) {
  const content = state.pages[state.params.doc_id];

  if (content === undefined) {
    return html`
      <span>Loading...</span>
    `;
  }
  if (content === null) {
    return html`
      <span>No such page</span>
    `;
  }

  return render(content);
}
