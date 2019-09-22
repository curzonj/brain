import { useState } from 'react';
import { buildAbstractPage, AbstractPage } from './abstract_page';
import { reportError } from '../utils/errors';

export interface LoadedAbstractPage {
  loaded?: string;
  page?: AbstractPage;
}

export function useAbstractPage(topicId: string): AbstractPage | undefined {
  const [pageHolder, setState] = useState({} as LoadedAbstractPage);

  if (pageHolder.loaded !== topicId) {
    reportError(async () => {
      const page = await buildAbstractPage(`/${topicId}`);
      setState({
        page,
        loaded: topicId,
      });
    });
  }

  return pageHolder.page;
}
