const html = require('choo/html');
const css = require('sheetify');

const bodyCss = css`
  :host {
    display: block;
    margin: 16px;
    height: 100%;

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

module.exports = wrap;
function wrap(children) {
  return (state, emit) => html`
      <body class=${bodyCss}>
        ${menuBar(state, emit)}
        ${children(state, emit)}
      </body>
    `;
}

function menuBar(state, emit) {
  const menuCss = css`
    :host {
      margin-top: 2px;

      list-style-type: none;
      overflow: hidden;
    }

    :host li {
      float: right;
      padding: 0.3em;
    }
  `;

  return html`
    <ul class=${menuCss}>
      <li><a href="#index">index</a></li>
      <li><a href="#add_note">add note</a></li>
      <li><a href="#" onclick=${onclickSync}>sync</a></li>
    </ul>
    <div style="clear:both"></div>
  `;

  function onclickSync(e) {
    e.preventDefault();

    emit(state.events.pouchdb_sync)
  }
}
