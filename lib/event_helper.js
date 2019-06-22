module.exports = buildNamespace;

function buildNamespace(namespace, eOuter) {
  return function register(name, fn, state, eInner) {
    const e = eInner || eOuter;
    const key = `${namespace}_${name}`;
    const eventString = `${namespace}:${name}`;

    state.events[key] = eventString;
    e.on(eventString, fn);
  };
}
