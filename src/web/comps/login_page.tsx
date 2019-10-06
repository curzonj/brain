import React, { useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router';
import BarLoader from 'react-spinners/BarLoader';
import { reportError } from '../../common/errors';
import { configure, initialize, loading } from '../utils/data';
import { BigTextAreaPage } from './big_textarea';
import { css } from '@emotion/core';

export const LoginPage: React.FC<RouteComponentProps> = props => {
  async function onSubmit(text: string) {
    configure(text);

    // The topics page will wait for the data to finish
    // loading. We go to that page now so the user has some
    // feedback when the submit the configuration
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

const loadingBarCss = css`
  position: absolute;
  left: 0px;
  top: 0px;
  z-index: -1;
`;

export const LoginRedirector = withRouter((props: RouteComponentProps) => {
  const [dbInitialized, setInitialized] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(loading.hasFired());

  if (!dataLoaded) loading.once((err, done) => setDataLoaded(true));

  if (!dbInitialized && props.location.pathname !== '/login') {
    reportError(async () => {
      const ok = await initialize();
      if (ok) {
        setInitialized(true);
      } else {
        props.history.push('/login');
      }
    });
  }

  return (
    <BarLoader
      css={loadingBarCss}
      widthUnit={'%'}
      width={100}
      color={'rgb(54, 215, 183)'}
      loading={!dataLoaded}
    />
  );
});
