import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './menu.css';

interface MenuProps {
  children: ReactNode;
}

export const Menu: React.FC<MenuProps> = props => {
  return (
    <div>
      <ul className="menu">
        {props.children}
        <li style={{ float: 'left' }}>
          <Link to="/menu">menu</Link>
        </li>
      </ul>
      <div style={{ clear: 'both' }}></div>
    </div>
  );
};
