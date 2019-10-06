import { useState } from 'react';
import { buildAbstractPage, getPageTitle, AbstractPage } from './abstract_page';
import { reportError } from '../../common/errors';

export interface LoadedAbstractPage {
  loaded?: string;
  page?: AbstractPage;
}

export function useAbstractPage(topicId: string): AbstractPage | undefined {
  const [pageHolder, setState] = useState({} as LoadedAbstractPage);

  if (pageHolder.loaded === topicId) {
    return pageHolder.page;
  }

  reportError(async () => {
    const title = await getPageTitle(topicId);
    setState({
      page: { title, sections: [] },
      loaded: topicId,
    });
    const page = await buildAbstractPage(topicId);
    setState({
      page,
      loaded: topicId,
    });
  });
}
