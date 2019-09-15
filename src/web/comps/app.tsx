import React from 'react';
import { Router, Route, Switch, Redirect } from 'react-router-dom';
import { createBrowserHistory } from 'history';

import './app.css';
import { TopicPage } from './topic_page';
import { NotePage } from './note_page';

const history = createBrowserHistory();

export const App: React.FC = () => {
  return (
    <Router history={history}>
      <Switch>
        <Redirect from="/" to="/index" exact />
        <Route path="/add_note/:topicId" component={NotePage} />
        <Route path="/:topicId" component={TopicPage} />
      </Switch>
    </Router>
  );
};
