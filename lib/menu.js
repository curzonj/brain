const html = require('choo/html');
const css = require('sheetify');

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

module.exports = withMenu

function withMenu(items, children) {
  return (state, emit) => html`
    <ul class=${menuCss}>
      ${items(state, emit)}
    </ul>
    <div style="clear:both"></div>

    ${children(state, emit)}
  `;
}
