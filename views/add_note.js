const html = require('choo/html');
const css = require('sheetify');

const body = require('../lib/layout');
const withMenu = require('../lib/menu');

module.exports = body(view);

const formCss = css`
  :host textarea {
    width: 100%;
    height: 100vh;
  }
`;

function view(state, emit) {
  const menuItems = () => html`
    <li><a href="#" onclick=${done}>done</a></li>
  `;

  const form = () => html`
    <form class=${formCss}>
      <textarea
        id="addNoteTextArea"
        name="text"
        onkeydown=${onkeydown}
        autocomplete="on"
        autocapitalize="sentences"
        required
        value=""
      ></textarea>
    </form>
  `;

  return withMenu(menuItems, form)();

  function onkeydown(e) {
    if (e.which === 13 && (e.metaKey || e.shiftKey)) done(e);
  }

  function done(e) {
    e.preventDefault();

    const { value } = document.getElementById('addNoteTextArea');
    if (value !== '') {
      const doc = state.pages[state.params.wildcard];
      emit(state.events.pouchdb_note, {
        topicId: doc.id,
        value,
      });
    }

    emit('replaceState', `#${state.params.wildcard}`);
  }
}
