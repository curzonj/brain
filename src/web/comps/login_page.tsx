import React, { useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router';
import { reportError } from '../../common/errors';
import { configure, initialize } from '../utils/data';
import { BigTextAreaPage } from './big_textarea';

export const LoginPage: React.FC<RouteComponentProps> = props => {
  async function onSubmit(text: string) {
    // This await actually waits for the full database
    // to finish loading, so it won't try and render the index
    // until the data is available
    await configure(text);
    props.history.push('/index');
  }

  return (
    <BigTextAreaPage handler={onSubmit}>
      <div className="header">
        <h1 className="title">Enter the configuration</h1>
      </div>
    </BigTextAreaPage>
  );
};

export const LoginRedirector = withRouter((props: RouteComponentProps) => {
  const [dbInitialized, setState] = useState(false);

  if (!dbInitialized && props.location.pathname !== '/login') {
    reportError(async () => {
      const ok = await initialize();
      if (ok) {
        setState(true);
      } else {
        props.history.push('/login');
      }
    });
  }

  return <></>;
});
