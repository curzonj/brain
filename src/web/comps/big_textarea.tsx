import React, { useState } from 'react';
import { reportError } from '../utils/errors';
import { Menu } from './menu';

type Props = {
  handler: (s: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const BigTextAreaPage: React.FC<Props> = ({
  handler,
  children,
  ...restProps
}) => {
  const [textValue, setTextValue] = useState('');

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.which === 13 && (e.metaKey || e.shiftKey)) onSubmitHandler(e);
  }

  function onSubmitHandler(e: React.SyntheticEvent) {
    e.preventDefault();
    reportError(() => handler(textValue));
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (e && e.target) {
      setTextValue(e.target.value);
    }
  }

  return (
    <div {...restProps}>
      <Menu>
        <li>
          <button
            type="button"
            className="link-button"
            onClick={onSubmitHandler}
          >
            done
          </button>
        </li>
      </Menu>

      {children}

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
};
