import { debug as debugLib } from 'debug';

const debug = {
  basic: debugLib('kbase:basic'),
  uiEvents: debugLib('kbase:uievents'),
  trace: debugLib('kbase:trace'),
};

export default debug;
