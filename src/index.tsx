import React from 'react';
import ReactDOM from 'react-dom';
import './web/index.css';
import { App } from './web/comps/app';
import * as serviceWorker from './web/serviceWorker';

ReactDOM.render(<App />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.register();
