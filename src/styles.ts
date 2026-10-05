export const styles = `
.qg { --qg-border:var(--lumiverse-border,rgba(160,174,195,.23)); --qg-muted:var(--lumiverse-text-muted,#9aa6b8); color:var(--lumiverse-text,#e8edf5); font:inherit; padding:16px; box-sizing:border-box; max-width:640px; margin:auto; }
.qg * {box-sizing:border-box} .qg h2 {font-size:18px; margin:0 0 6px} .qg p {margin:0 0 16px; color:var(--qg-muted); font-size:12px; line-height:1.6}
.qg-toolbar,.qg-actions {display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:14px} .qg-toolbar select {flex:1; min-width:150px}
.qg button,.qg input,.qg select,.qg textarea {font:inherit; color:inherit; background:var(--lumiverse-bg,rgba(0,0,0,.2)); border:1px solid var(--qg-border); border-radius:8px; padding:10px 12px; font-size:calc(13px * var(--lumiverse-font-scale,1)); min-height:36px}
.qg input:not([type=checkbox]),.qg select,.qg textarea {width:100%; min-width:0} .qg textarea {min-height:72px; resize:vertical; line-height:1.5} .qg input[type=checkbox] {accent-color:var(--lumiverse-primary,#a78bfa); min-height:0}
.qg button {cursor:pointer; font-weight:500; padding:8px 14px; background:transparent; color:var(--qg-muted); white-space:nowrap} .qg button:hover {background:var(--lumiverse-fill-subtle); color:var(--lumiverse-text)} .qg button:disabled {opacity:.5; cursor:default}
.qg button.qg-primary {background:var(--lumiverse-primary,#237d8e); color:var(--lumiverse-primary-contrast,#fff); border-color:var(--lumiverse-primary,#237d8e)} .qg button.qg-primary:hover {background:var(--lumiverse-primary-hover,var(--lumiverse-primary,#237d8e))} .qg button.qg-danger {color:var(--lumiverse-danger,#f6a6a6)}
.qg-step {border:1px solid var(--qg-border); border-radius:10px; padding:14px; background:var(--lumiverse-fill-subtle,rgba(255,255,255,.025))}

.qg label {display:block; font-size:calc(13px * var(--lumiverse-font-scale,1)); margin:0 0 16px} .qg label>span {display:block; margin-bottom:6px; font-weight:500; color:var(--qg-muted)} .qg small {font-size:calc(11px * var(--lumiverse-font-scale,1)); color:var(--lumiverse-text-dim,var(--qg-muted))}
.qg details {border-top:1px solid var(--qg-border); padding-top:12px; margin-top:12px} .qg summary {font-size:12px; cursor:pointer; margin-bottom:12px} .qg .qg-check {display:flex; gap:8px; align-items:center}
.qg-status {border:1px solid var(--qg-border); border-radius:10px; padding:12px; margin-top:12px; font-size:12px; line-height:1.6} .qg-status[role=alert] {color:#f6a6a6; border-color:rgba(230,110,110,.4)}
.qg progress {width:100%; height:6px; accent-color:var(--lumiverse-primary,#a78bfa); margin-top:8px} .qg-results {display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:14px}
.qg-results figure {margin:0; overflow:hidden; border:1px solid var(--qg-border); border-radius:10px} .qg-results img,.qg-results video {width:100%; max-height:360px; object-fit:contain; display:block; background:rgba(0,0,0,.2)} .qg-results figcaption {padding:10px; font-size:12px}
.qg-result-actions {display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:6px} .qg label>small {display:block; margin-top:5px; line-height:1.5}
.qg-post-actions {display:flex; flex-wrap:wrap; gap:8px} .qg-result-posted {color:var(--qg-muted)} .qg p.qg-media-unavailable {padding:16px; margin:0; text-align:center}
.qg a {color:var(--lumiverse-primary,#a78bfa)} .qg footer {margin-top:16px; color:var(--qg-muted); font-size:11px} .qg .qg-saved {color:var(--qg-muted); font-size:11px}
/* Match ImgGen's FormComponents fields using the shared live theme tokens. */
.qg input,.qg textarea {transition:border-color var(--lumiverse-transition-fast,.15s),box-shadow var(--lumiverse-transition-fast,.15s)}
.qg input:focus,.qg textarea:focus {border-color:var(--lumiverse-primary-muted,#a78bfa); box-shadow:0 0 0 3px var(--lumiverse-primary-010,rgba(167,139,250,.1)); outline:none}
.qg select {padding-right:32px; appearance:none; cursor:pointer; transition:border-color var(--lumiverse-transition-fast,.15s)}
.qg select:focus {border-color:var(--lumiverse-primary-muted,#a78bfa); outline:none}
.qg .qg-select {position:relative; margin:0; color:inherit; font-weight:400}
.qg .qg-select::after {content:''; position:absolute; right:14px; top:50%; width:7px; height:7px; border-right:1.5px solid var(--qg-muted); border-bottom:1.5px solid var(--qg-muted); transform:translateY(-70%) rotate(45deg); pointer-events:none}
.qg input:disabled,.qg select:disabled,.qg textarea:disabled {opacity:.5; cursor:not-allowed}
@media(max-width:700px) {.qg{padding:12px}}
`
