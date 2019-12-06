import React from 'react';
import { Menu } from './menu';
import { Link } from 'react-router-dom';
import './menu_page.css';

export function MenuPage(props: {}) {
  return (
    <div className="menuPage">
      <Menu>
        <li>
          <Link to="/index">index</Link>
        </li>
      </Menu>

      <ul>
        <li>
          <Link to="/search">search</Link>
        </li>
        <li>
          <Link to="/recent">recent</Link>
        </li>
      </ul>
    </div>
  );
}
