import React, { useState } from 'react';

export function LoadingStats(props: { duration?: number }) {
  const [pastTime, setState] = useState(false);

  if (pastTime) return <></>;

  setTimeout(() => setState(true), props.duration || 2000);
  return (
    <span className="codeversion">
      {process.env.REACT_APP_GIT_SHA || 'gitsha'}
    </span>
  );
}
