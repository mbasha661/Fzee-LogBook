import React from 'react';
export function Brand({compact = false}: {compact?: boolean}) {
  return <div className={`fzee-brand ${compact ? 'fzee-brand-compact' : ''}`}><img src="/icon.svg" width="42" height="42" alt="FZEE feather and logbook mark"/><div><div className="brand-name"><span>Fzee</span>LogBook</div><div className="brand-tagline">FLY WITH FEATHERS</div></div></div>;
}
