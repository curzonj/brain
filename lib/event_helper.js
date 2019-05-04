module.exports = buildNamespace;

function buildNamespace(namespace, e_outer) {
  return function register(name, fn, state, e_inner) {
    const e = e_inner || e_outer;
    const key = `${namespace}_${name}`;
    const event_string = `${namespace}:${name}`;

    state.events[key] = event_string;
    e.on(event_string, fn);
  };
}
