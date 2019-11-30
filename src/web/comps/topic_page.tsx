import React from 'react';
import { RouteComponentProps } from 'react-router';
import { Link } from 'react-router-dom';
import { Menu } from './menu';
import './topic_page.css';
import * as models from '../../common/models';
import { deriveTitle } from '../../common/content';
import { useAsync } from './use_async';
import { buildAbstractPage, AbstractPage, Section, Div } from '../utils/abstract_page';

export function TopicHeader(props: { title: string }) {
  return (
    <div className="header">
      <h1 className="title">{props.title}</h1>
    </div>
  );
}

export function TopicPage(props: RouteComponentProps<{ topicId: string }>) {
  const { topicId } = props.match.params;
  const page = useAsync(topicId, buildAbstractPage);

  return (
    <div className="topicPage">
      <Menu>
        <li>
          <Link to="/index">index</Link>
        </li>
        <li>
          <Link to={`/add_note/${topicId}`}>add note</Link>
        </li>
      </Menu>

      {page && <TopicHeader title={page.title} />}
      {page && renderSections(page.sections)}
    </div>
  );
}

function renderSections(sections: Section[]) {
  return sections.map((s, i) => {
    return (
      <section key={i}>
        {s.title && <h2 className="title">{s.title}</h2>}
        {s.text && textItem(s, false)}
        {s.divs && sectionDivs(s.divs)}
      </section>
    );
  });
}

function sectionDivs(divs: Div[]) {
  return divs.map((d, i) => {
    return (
      <div key={i}>
        {d.heading && <h3 className="title">{d.heading}</h3>}
        {simpleList(d.list)}
      </div>
    );
  });
}

function simpleList(list: any[]) {
  return (
    <ul>
      {list.map((s, i) => (
        <li key={i}>{textItem(s)}</li>
      ))}
    </ul>
  );
}

function textItem(item: any, showMore: boolean = true) {
  if (!item) {
    throw new Error('item parameter is missing');
  } else if (typeof item === 'string') {
    if (item.startsWith('http')) {
      return buildAnchorElement(item);
    }
    return <p>{item}</p>;
  } else if (!item.text && (item.link || item.search)) {
    return buildAnchorElement(item);
  } else if (item.label) {
    return refLink(item.ref, item.label);
  } else {
    return (
      <p>
        {item.text}
        {item.src && <span> - {renderSrc(item.src)} </span>}
        {showMore && <span> ({refLink(item.ref, 'more', 'moreLink')})</span>}
      </p>
    );
  }
}

function renderSrc(src: any) {
  if (!src) {
    return undefined;
  } else if (typeof src === 'string') {
    return buildAnchorElement({ link: src, title: 'src' });
  } else if (src.ref) {
    return refLink(src.ref, src.label);
  } else {
    // TODO replace this, it could be a labeled link
    return <pre>{JSON.stringify(src)}</pre>;
  }
}

function buildAnchorElement(obj: any) {
  const mobile = document.documentElement.clientWidth < 800;

  if (typeof obj === 'string' || obj.link) {
    let target = obj;
    let text = obj;

    if (typeof obj !== 'string') {
      target = obj.link;
      text = obj.title || obj.link;
    }

    if (text.startsWith('https://en.wikipedia.org/wiki')) {
      text = `Wikipedia: ${text
        .replace('https://en.wikipedia.org/wiki/', '')
        .replace(/_/g, ' ')}`;
    } else if (text.indexOf('pinboard.in/u:curzonj/') !== -1) {
      text = `Pinboard: ${text
        .replace(/https?:\/\/pinboard.in\/u:curzonj\//, '')
        .split('/')
        .filter((l: string) => l !== '')
        .flatMap((l: string) => l.replace(/^t:/, ''))
        .join(', ')}`;
      target = target.replace(/^http:\/\//, 'https://');
      if (mobile) {
        target = target.replace('pinboard.in', 'm.pinboard.in');
      }
    }

    return (
      <a target="_blank" rel="noopener noreferrer" href={target}>
        {text}
      </a>
    );
  }
  if (obj.search) {
    return (
      <a
        target="_blank"
        rel="noopener noreferrer"
        href={'https://google.com/search?q=' + encodeURIComponent(obj.search)}
      >
        Google: {obj.search}
      </a>
    );
  }

  return undefined;
}

function refLink(link: string, text: string, cssClass: string = 'refLink') {
  return (
    <Link className={cssClass} to={encodeURI(link)}>
      {text || link}
    </Link>
  );
}
