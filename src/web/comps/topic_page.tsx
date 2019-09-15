import React, { Component } from 'react';
import { RouteComponentProps } from 'react-router';
import { Link } from 'react-router-dom';
import { Menu } from './menu';

interface TopicPageParams {
  topicId: string;
}

export class TopicPage extends Component<RouteComponentProps<TopicPageParams>> {
  componentDidMount() {}

  componentWillUnmount() {}

  render() {
    const { topicId } = this.props.match.params;

    return (
      <>
        <Menu>
          <li>
            <Link to="/index">index</Link>
          </li>
          <li>
            <Link to={'/add_note/' + topicId}>add note</Link>
          </li>
        </Menu>
        <h2>{topicId}</h2>
      </>
    );
  }
}
