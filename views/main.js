const html = require('choo/html');
const css = require('sheetify');
const render = require('../lib/renderer');

const TITLE = 'brain';

module.exports = view;
function view(state, emit) {
  if (state.title !== TITLE) emit(state.events.DOMTITLECHANGE, TITLE);

  const className = css`
    :host {
      display: block;
      margin: 8px;
    }
  `;

  if (!state.params.doc_id) {
    emit('replaceState', '#index');
    return html`
      <body class=${className}>
        <span>Redirecting ...</span>
      </body>
    `;
  }

  return html`
    <body class=${className}>
      ${menuBar()}
      ${renderOrLoading(state)}
    </body>
  `;

  function handleClick() {
    emit('clicks:add', 1);
  }
}

function menuBar() {
  const className = css`
    :host {
      margin-top: 2px;
      float: right;
    }
  `;

  return html`
    <div class=${className}>
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
