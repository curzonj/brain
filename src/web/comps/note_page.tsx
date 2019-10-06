import React from 'react';
import { RouteComponentProps } from 'react-router';
import { useAbstractPage } from '../utils/abstract_page_react';
import { addNote } from '../utils/data';
import { TopicHeader } from './topic_page';
import { BigTextAreaPage } from './big_textarea';

export const NotePage: React.FC<
  RouteComponentProps<{ topicId: string }>
> = props => {
  const { topicId } = props.match.params;
  const page = useAbstractPage(topicId);

  async function onSubmit(text: string) {
    if (text.trim() !== '') {
      await addNote(topicId, text);
    }

    props.history.push(`/${topicId}`);
  }

  return (
    <BigTextAreaPage className="topicPage" handler={onSubmit}>
      {page && <TopicHeader page={page} />}
    </BigTextAreaPage>
  );
};
