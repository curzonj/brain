import React, { Component } from 'react';
import { RouteComponentProps } from 'react-router';
import { Link } from 'react-router-dom';
import { Menu } from './menu';
import './topic_page.css';
import { buildAbstractPage } from '../utils/abstract_page';

interface TopicPageParams {
  topicId: string;
}

export class TopicPage extends Component<RouteComponentProps<TopicPageParams>> {
  componentDidMount() {}

  componentWillUnmount() {}

  render() {
    const { topicId } = this.props.match.params;

    return (
      <div className="topicPage">
        <Menu>
          <li>
            <Link to="/index">index</Link>
          </li>
          <li>
            <Link to={'/add_note/' + topicId}>add note</Link>
          </li>
        </Menu>

        <div className="header">
          <h1 className="title">{topicId}</h1>
        </div>
      </div>
    );
  }
}
