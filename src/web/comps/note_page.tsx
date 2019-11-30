import React from 'react';
import { RouteComponentProps } from 'react-router';
import { addNote } from '../utils/data';
import { TopicHeader } from './topic_page';
import { BigTextAreaPage } from './big_textarea';
import { useAsync } from './use_async';
import { getTopic } from '../utils/data';
import { deriveTitle } from '../../common/content';

export const NotePage: React.FC<
  RouteComponentProps<{ topicId: string }>
> = props => {
  const { topicId } = props.match.params;
  const payload = useAsync(topicId, getTopic);

  async function onSubmit(text: string) {
    if (text.trim() !== '') {
      await addNote(topicId, text);
    }

    props.history.push(`/${topicId}`);
  }

  return (
    <BigTextAreaPage className="topicPage" handler={onSubmit}>
      {payload && <TopicHeader title={deriveTitle(payload.topic)} />}
    </BigTextAreaPage>
  );
};
