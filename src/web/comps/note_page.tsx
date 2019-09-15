import React, { Component } from 'react';
import { RouteComponentProps } from 'react-router';
import { Menu } from './menu';

interface NotePageParams {
  topicId: string;
}

export class NotePage extends Component<RouteComponentProps<NotePageParams>> {
  componentDidMount() {}

  componentWillUnmount() {}

  hello() {
    console.log('Hello world');
  }

  render() {
    const { topicId } = this.props.match.params;

    return (
      <>
        <Menu>
          <li>
            <button type="button" className="link-button" onClick={this.hello}>
              done
            </button>
          </li>
        </Menu>
        <h2>{topicId}</h2>
      </>
    );
  }
}
