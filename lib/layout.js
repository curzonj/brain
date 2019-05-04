const html = require('choo/html');
const css = require('sheetify');

const bodyCss = css`
  @media screen and (min-width: 800px) {
    :host {
      margin: 16px;
    }
  }

  :host {
    display: block;
    height: 100%;

    font-size: 16px;
    line-height: 1.3em;

    word-wrap: break-word;
    color: #333333;
    background-color: #f4f4f4;
    fill: #333333;

    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  :host a {
    text-decoration: none;
    color: #5778d8;
  }
`;

module.exports = wrap;
function wrap(children) {
  return (state, emit) => html`
      <body class=${bodyCss}>
        ${children(state, emit)}
      </body>
    `;
}

