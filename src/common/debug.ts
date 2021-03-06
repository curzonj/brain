import { debug as debugLib } from 'debug';

const debug = {
  warning: debugLib('kbase:warning'),
  events: debugLib('kbase:events'),
  network: debugLib('kbase:network'),
  storage: debugLib('kbase:storage'),
  performance: {
    timing: debugLib('kbase:performance:timing'),
    profiling: debugLib('kbase:performance:profiling'),
  },
  uiEvents: debugLib('kbase:uievents'),
  trace: debugLib('kbase:trace'),
};

export default debug;
