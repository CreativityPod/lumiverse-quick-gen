export const styles = `
.qg { --qg-border:var(--lumiverse-border,rgba(160,174,195,.23)); --qg-muted:var(--lumiverse-text-muted,#9aa6b8); color:var(--lumiverse-text,#e8edf5); font:inherit; padding:16px; box-sizing:border-box; max-width:900px; margin:auto; }
.qg * {box-sizing:border-box} .qg h2 {font-size:18px; margin:0 0 6px} .qg p {margin:0 0 16px; color:var(--qg-muted); font-size:12px; line-height:1.6}
.qg-toolbar,.qg-actions {display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:14px} .qg-toolbar select {flex:1; min-width:150px}
.qg button,.qg input,.qg select,.qg textarea {font:inherit; color:inherit; background:var(--lumiverse-fill,#202a39); border:1px solid var(--qg-border); border-radius:7px; padding:9px 10px; min-height:36px}
.qg input:not([type=checkbox]),.qg select,.qg textarea {width:100%; min-width:0} .qg textarea {min-height:72px; resize:vertical} .qg input[type=checkbox] {accent-color:#62bdce; min-height:0}
.qg button {cursor:pointer; font-size:12px; white-space:nowrap} .qg button:hover {border-color:#62bdce} .qg button:disabled {opacity:.5; cursor:default}
.qg button.qg-primary {background:var(--lumiverse-primary,#237d8e); color:white; border-color:transparent} .qg button.qg-danger {color:#f6a6a6}
.qg-grid {display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:16px 0} .qg-step {border:1px solid var(--qg-border); border-radius:10px; padding:14px; background:var(--lumiverse-fill-subtle,rgba(255,255,255,.025))}
.qg-step h3 {font-size:14px; margin:0 0 16px; display:flex; align-items:center; gap:8px} .qg-number {border-radius:50%; width:23px; height:23px; display:inline-grid; place-items:center; background:rgba(98,189,206,.14); color:#80ccda; font-size:12px}
.qg label {display:block; font-size:12px; margin:0 0 12px} .qg label>span {display:block; margin-bottom:6px; color:var(--qg-muted)} .qg small {font-size:11px; color:var(--qg-muted)}
.qg details {border-top:1px solid var(--qg-border); padding-top:12px; margin-top:12px} .qg summary {font-size:12px; cursor:pointer; margin-bottom:12px} .qg .qg-check {display:flex; gap:8px; align-items:center}
.qg-status {border:1px solid var(--qg-border); border-radius:10px; padding:12px; margin-top:12px; font-size:12px; line-height:1.6} .qg-status[role=alert] {color:#f6a6a6; border-color:rgba(230,110,110,.4)}
.qg progress {width:100%; height:6px; accent-color:#62bdce; margin-top:8px} .qg-results {display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:14px}
.qg-results figure {margin:0; overflow:hidden; border:1px solid var(--qg-border); border-radius:10px} .qg-results img,.qg-results video {width:100%; max-height:360px; object-fit:contain; display:block; background:rgba(0,0,0,.2)} .qg-results figcaption {padding:10px; font-size:12px}
.qg a {color:#80ccda} .qg footer {margin-top:16px; color:var(--qg-muted); font-size:11px} .qg .qg-saved {color:var(--qg-muted); font-size:11px}
@media(max-width:700px) {.qg-grid{grid-template-columns:1fr}.qg{padding:12px}}
`
