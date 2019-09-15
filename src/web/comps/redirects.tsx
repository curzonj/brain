import React, { Component } from 'react';
import { RouteComponentProps } from 'react-router';

export class RedirectsHandler extends Component<RouteComponentProps> {
  unlisten?: () => void;

  componentDidMount() {
    const { history } = this.props;
    if (this.props.location.pathname !== '/about/') {
      history.push('/about/');
    }

    this.unlisten = this.props.history.listen((location, action) => {
      if (location.pathname !== '/about/') {
        history.push('/about/');
      }
    });
  }

  componentWillUnmount() {
    if (this.unlisten) {
      this.unlisten();
    }
  }

  render() {
    return <></>;
  }
}
