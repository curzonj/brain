import { debug as debugLib } from 'debug';

const debug = {
  basic: debugLib('kbase:basic'),
  events: debugLib('kbase:events'),
  network: debugLib('kbase:network'),
  storage: debugLib('kbase:storage'),
  uiEvents: debugLib('kbase:uievents'),
  trace: debugLib('kbase:trace'),
};

export default debug;
