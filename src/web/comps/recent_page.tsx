import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { leveldb } from '../utils/data';
import debug from '../../common/debug';
import { catchError } from '../../common/errors';
import { Menu } from './menu';
import { PageHeader } from './elements';
import { maybePayloadsToTextObjects, TextObject } from '../utils/abstract_page';
import { notesSorter } from '../../common/content';
import { simpleList } from './topic_page';
import * as models from '../../common/models';

export function RecentPage(props: {}) {
  const [results, setResults] = useState<TextObject[]>();

  useEffect(() => catchError(async () => {
    const topics: models.Payload[] = await leveldb.topics.getAll();
    const text = await maybePayloadsToTextObjects(topics.sort(notesSorter).slice(0,200));

    setResults(text);
  }));

  return (
    <div className="recentPage">
      <Menu>
        <li>
          <Link to="/index">index</Link>
        </li>
      </Menu>

      <PageHeader title="Recent Entries" />
      {results && simpleList(results)}
    </div>
  );
}
