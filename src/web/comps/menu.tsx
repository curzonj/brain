import React, { ReactNode } from 'react';
import './menu.css';

interface MenuProps {
  children: ReactNode;
}

export const Menu: React.FC<MenuProps> = props => {
  return (
    <div>
      <ul className="menu">{props.children}</ul>
      <div style={{ clear: 'both' }}></div>
    </div>
  );
};
