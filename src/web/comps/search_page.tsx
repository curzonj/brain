import React, { useState } from 'react';
import { Menu } from './menu';
import { Link } from 'react-router-dom';
import './search_page.css';

export function SearchPage(props: {}) {
  const [state, setState] = useState<string>('search input...');
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e && e.target) {
      let value = e.target.value;
      if (value === '') value = 'search input...';
      setState(value);
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
      <p>{state}</p>
    </div>
  );
}
