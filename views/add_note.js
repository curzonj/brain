const html = require('choo/html');
const css = require('sheetify');
const yaml = require('js-yaml');
const assert = require('assert');

const body = require('./layout')

module.exports = body(view);

const formCss = css`
  :host textarea {
    width: 100%;
    height: 100vh;
  }
`;

function view(state, emit) {
  return html`
    <form class=${formCss} id="note" onsubmit=${onsubmit}>
      <textarea
        name="text"
        onkeydown=${onkeydown}
        autocomplete=on
        autocapitalize=sentences
        required
        value=""></textarea>
      <input type="submit" style="visibility:hidden;position:absolute"/>
    </form>
  `;

  function onkeydown(e) {
    if (e.which == 13 && (e.metaKey || e.shiftKey)) {
      e.preventDefault();
      addNote(this.form);
    }
  }

  function onsubmit(e) {
    e.preventDefault()
    addNote(e.currentTarget)
  }

  function addNote(form) {
    emit(state.events.pouchdb_note, form.childNodes[0].value);
    emit('replaceState', '#index');
  }
}
