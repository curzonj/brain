module.exports = buildNamespace;

function buildNamespace(namespace, e_outer) {
  return function register(name, fn, e_inner) {
    const e = e_inner || e_outer;
    const key = `${namespace}_${name}`;
    const event_string = `${namespace}:${name}`;

    e.events[key] = event_string;

    e.on('DOMContentLoaded', () => {
      e.on(event_string, fn);
    });
  };
}
