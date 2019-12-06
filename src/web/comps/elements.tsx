import React from 'react';

export function PageHeader(props: { title: string }) {
  return (
    <div className="header">
      <h1 className="title">{props.title}</h1>
    </div>
  );
}
