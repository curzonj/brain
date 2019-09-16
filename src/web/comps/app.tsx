import React, { Component } from 'react';
import { Router, Route, Switch, Redirect } from 'react-router-dom';
import { withRouter, RouteComponentProps } from 'react-router';
import { createBrowserHistory } from 'history';

import './app.css';
import { TopicPage } from './topic_page';
import { NotePage } from './note_page';
import { LoginPage } from './login_page';
import { initialize as dbInitialize } from '../utils/db';
import { reportError } from '../utils/errors';

const history = createBrowserHistory();

reportError(async () => {
  const ok = await dbInitialize();
  if (!ok) {
    history.push('/login');
  }
});

class ScrollToTopInner extends Component<RouteComponentProps> {
  componentDidUpdate(prevProps: RouteComponentProps) {
    if (this.props.location.pathname !== prevProps.location.pathname) {
      window.scrollTo(0, 0);
    }
  }

  render() {
    return this.props.children;
  }
}

const ScrollToTop = withRouter(ScrollToTopInner);

export const App: React.FC = () => {
  return (
    <Router history={history}>
      <ScrollToTop>
        <Switch>
          <Redirect from="/" to="/index" exact />
          <Route path="/login" component={LoginPage} />
          <Route path="/add_note/:topicId" component={NotePage} />
          <Route path="/:topicId" component={TopicPage} />
        </Switch>
      </ScrollToTop>
    </Router>
  );
};
