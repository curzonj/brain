import React from 'react';
import {
  BrowserRouter as Router,
  Route,
  Switch,
  Redirect,
} from 'react-router-dom';
import './app.css';
import { TopicPage } from './topic_page';
import { NotePage } from './note_page';
import { LoginPage, LoginRedirector } from './login_page';
import { ScrollToTop } from './scroll';

export const App: React.FC = () => {
  return (
    <Router basename={process.env.PUBLIC_URL}>
      <LoginRedirector />

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
