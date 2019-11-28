import React from 'react';
import { withRouter, RouteComponentProps } from 'react-router';

class ScrollToTopInner extends React.Component<RouteComponentProps> {
  componentDidUpdate(prevProps: RouteComponentProps) {
    if (this.props.location.pathname !== prevProps.location.pathname) {
      if (window.name !== "nodejs") window.scrollTo(0, 0);
    }
  }

  render() {
    return this.props.children;
  }
}
export const ScrollToTop = withRouter(ScrollToTopInner);
