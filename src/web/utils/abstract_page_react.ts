import { useState } from 'react';
import { buildAbstractPage, AbstractPage } from './abstract_page';
import { reportError } from '../../common/errors';

export interface LoadedAbstractPage {
  topicId?: string;
  page?: AbstractPage;
}

export function useAbstractPage(topicId: string): AbstractPage | undefined {
  const [pageHolder, setState] = useState({} as LoadedAbstractPage);

  if (pageHolder.topicId === topicId) {
    return pageHolder.page;
  }

  reportError(async () =>
    buildAbstractPage(topicId, page => setState({ page, topicId }))
  );
}
