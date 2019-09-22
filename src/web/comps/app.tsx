import React, { Component } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Switch,
  Redirect,
} from 'react-router-dom';
import { withRouter, RouteComponentProps } from 'react-router';
import './app.css';
import { TopicPage } from './topic_page';
import { NotePage } from './note_page';
import { LoginPage } from './login_page';
import { initialize as dbInitialize } from '../utils/db';
import { reportError } from '../utils/errors';

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

const HistoryExporter = withRouter((props: RouteComponentProps) => {
  reportError(async () => {
    const ok = await dbInitialize();
    if (!ok) {
      props.history.push('/login');
    }
  });

  return <></>;
});

export const App: React.FC = () => {
  return (
    <Router basename={process.env.PUBLIC_URL}>
      <HistoryExporter />

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
