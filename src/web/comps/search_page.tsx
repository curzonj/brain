import React, { useState } from 'react';
import { Link, useLocation, useHistory } from 'react-router-dom';
import { debug as debugLib } from 'debug';
import { leveldb } from '../utils/data';
import { ENDstr } from '../../leveldown/indexing';
import * as models from '../../common/models';
import { deriveTitle } from '../../common/content';
import { useAsync } from './use_async';
import { Menu } from './menu';
import { maybePayloadsToTextObjects, TextObject } from '../utils/abstract_page';
import { simpleList } from './topic_page';
import './search_page.css';

const debug = debugLib('kbase:search_page');

export type MaybeString = string | undefined | null;
export function SearchPage(props: {}) {
  const history = useHistory();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const searchTerm = query.get('search');
  const results = useAsync<TextObject[], MaybeString>(
    searchTerm,
    async (term: MaybeString): Promise<TextObject[]> => {
      if (!term) return [];
      const terms = await leveldb.topics.idx.terms.getAll({
        gte: term,
        lt: [term, ENDstr].join(''),
      });
      return maybePayloadsToTextObjects(terms);
    },
    { wait: 200, leading: true, fuzzy: true }
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e && e.target) {
      let value = e.target.value;
      if (value.length > 2) {
        history.replace({ ...location, search: `?search=${value}` });
      } else {
        history.replace({ ...location, search: '' });
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="searchPage">
      <Menu>
        <li>
          <Link to="/index">index</Link>
        </li>
      </Menu>

      <form onSubmit={onSubmit}>
        <input placeholder="Search for..." onChange={onChange} />
      </form>
      {searchTerm && results && simpleList(results)}
    </div>
  );
}

function useQuery() {}
