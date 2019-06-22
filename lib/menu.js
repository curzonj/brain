const html = require('choo/html');
const css = require('sheetify');

const menuCss = css`
  :host {
    margin: 8px;
    padding: 0;
    list-style-type: none;
    overflow: hidden;
  }

  :host li {
    font-weight: 500;
    font-size: 1.5em;
    float: right;
    margin: 8px;
  }
`;

module.exports = withMenu;

function withMenu(items, children) {
  return (state, emit) => html`
    <ul class=${menuCss}>
      ${items(state, emit)}
    </ul>
    <div style="clear:both"></div>

    ${children(state, emit)}
  `;
}
