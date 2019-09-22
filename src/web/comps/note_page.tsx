import React, { useState } from 'react';
import { Menu } from './menu';
import { RouteComponentProps } from 'react-router';
import { reportError } from '../utils/errors';
import { useAbstractPage } from '../utils/abstract_page_react';
import { addNote } from '../utils/db';
import { TopicHeader } from './topic_page';

export function NotePage(props: RouteComponentProps<{ topicId: string }>) {
  const { topicId } = props.match.params;
  const page = useAbstractPage(topicId);
  const [textValue, setTextValue] = useState('');

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.which === 13 && (e.metaKey || e.shiftKey)) onSubmit(e);
  }

  function onSubmit(e: React.SyntheticEvent) {
    e.preventDefault();

    reportError(async () => {
      const { topicId } = props.match.params;
      await addNote(topicId, textValue);
      props.history.push(topicId);
    });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (e && e.target) {
      setTextValue(e.target.value);
    }
  }

  return (
    <div className="topicPage">
      <Menu>
        <li>
          <button type="button" className="link-button" onClick={onSubmit}>
            done
          </button>
        </li>
      </Menu>

      <TopicHeader topicId={topicId} page={page} />

      <form>
        <textarea
          onKeyDown={onKeyDown}
          autoComplete="on"
          autoCapitalize="sentences"
          required
          onChange={onChange}
          value={textValue}
        ></textarea>
      </form>
    </div>
  );
}
