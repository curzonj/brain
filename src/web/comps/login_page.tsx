import React, { Component } from 'react';
import { RouteComponentProps } from 'react-router';
import { Menu } from './menu';
import { reportError } from '../utils/errors';
import * as db from '../utils/db';
import './login_page.css';

export class LoginPage extends Component<
  RouteComponentProps,
  { value: string }
> {
  constructor(props: RouteComponentProps) {
    super(props);
    this.state = { value: '' };
  }

  onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.which === 13 && (e.metaKey || e.shiftKey)) this.onSubmit(e);
  };

  onSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();

    reportError(async () => {
      await db.configure(this.state.value);
      this.props.history.push('/index');
    });
  };

  onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e && e.target) {
      this.setState({ value: e.target.value });
    }
  };

  render() {
    return (
      <div className="loginPage">
        <Menu>
          <li>
            <button
              type="button"
              className="link-button"
              onClick={this.onSubmit}
            >
              done
            </button>
          </li>
        </Menu>

        <div className="header">
          <h1 className="title">Enter the configuration</h1>
        </div>

        <form>
          <textarea
            onKeyDown={this.onKeyDown}
            autoComplete="on"
            autoCapitalize="sentences"
            required
            onChange={this.onChange}
            value={this.state.value}
          ></textarea>
        </form>
      </div>
    );
  }
}
