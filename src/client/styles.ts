/** All plugin styles in one sheet, injected once at client load. */

export const css = `
.dq-session-badge{position:relative;display:inline-flex;align-items:center;min-width:0}
.dq-session-badge-trigger{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;cursor:pointer;padding:3px 8px;border-radius:8px;color:var(--dsw-alias-label-tertiary,#59636e);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dq-session-badge-trigger:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328)}
.dq-session-badge-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:2px}
.dq-session-badge-trigger--warn{color:var(--dsw-alias-state-warn-primary,#9a6700)}
.dq-session-badge-trigger--over{color:var(--dsw-alias-state-error-primary,#cf222e)}
.dq-session-badge-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary,#2da44e)}
.dq-session-badge-dot--warn{background:var(--dsw-alias-state-warn-primary,#bf8700)}
.dq-session-badge-dot--over{background:var(--dsw-alias-state-error-primary,#cf222e)}
.dq-session-badge-metrics{overflow:hidden;text-overflow:ellipsis}
.dq-session-badge-panel{position:absolute;right:0;left:auto;top:calc(100% + 8px);z-index:2147483002;box-sizing:border-box;width:min(420px,calc(100vw - 48px));padding:12px 14px;border-radius:12px;background:var(--dsw-alias-bg-overlay,#ffffff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));box-shadow:0 12px 32px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary,#1f2328);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:12px;line-height:1.5;text-align:left;white-space:normal;cursor:default;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.dq-session-badge-panel:focus{outline:none}
.dq-session-badge-panel{max-height:min(78vh,640px);overflow:auto}
.dq-session-badge-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.dq-session-badge-panel-title{font-weight:600;font-size:13px}
.dq-session-badge-close{border:none;background:transparent;cursor:pointer;padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary,#59636e);font-size:12px;line-height:1}
.dq-session-badge-close:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328)}
.dq-session-badge-close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:1px}
.dq-session-badge-stats{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0 0 8px;font-variant-numeric:tabular-nums}
.dq-session-badge-stats dt{margin:0;color:var(--dsw-alias-label-secondary,#59636e)}
.dq-session-badge-stats dd{margin:0;color:var(--dsw-alias-label-primary,#1f2328)}
.dq-session-badge-split{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));margin:0 0 5px}
.dq-session-badge-split-seg{height:100%}
.dq-session-badge-split-seg--input{background:var(--dsw-alias-state-business-primary,#4176e6)}
.dq-session-badge-split-seg--output{background:var(--dsw-alias-state-warn-primary,#e16f24)}
.dq-session-badge-split-seg--cache{background:var(--dsw-alias-state-success-primary,#2da44e)}
.dq-session-badge-legend{display:flex;flex-wrap:wrap;gap:2px 12px;margin:0 0 8px;padding:0;list-style:none;color:var(--dsw-alias-label-secondary,#59636e)}
.dq-session-badge-legend li{display:flex;align-items:center;gap:4px;white-space:nowrap}
.dq-session-badge-legend b{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);font-variant-numeric:tabular-nums}
.dq-session-badge-legend-rate{margin-left:auto;color:var(--dsw-alias-label-tertiary,#59636e)}
.dq-session-badge-key{width:7px;height:7px;border-radius:2px;flex:none}
.dq-session-badge-key--input{background:var(--dsw-alias-state-business-primary,#4176e6)}
.dq-session-badge-key--output{background:var(--dsw-alias-state-warn-primary,#e16f24)}
.dq-session-badge-key--cache{background:var(--dsw-alias-state-success-primary,#2da44e)}
.dq-session-badge-status{margin:0 0 2px;font-weight:600}
.dq-session-badge-status--ok{color:var(--dsw-alias-label-secondary,#59636e)}
.dq-session-badge-status--warn{color:var(--dsw-alias-state-warn-primary,#9a6700)}
.dq-session-badge-status--over{color:var(--dsw-alias-state-error-primary,#cf222e)}
.dq-session-badge-note{margin:0 0 8px;color:var(--dsw-alias-label-tertiary,#59636e)}
.dq-session-badge-callout{margin:0 0 8px;padding:6px 8px;border-radius:8px;font-weight:600;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dq-session-badge-callout--warn{color:var(--dsw-alias-state-warn-label,#9a6700);background:var(--dsw-alias-state-warn-tertiary,rgba(154,103,0,.1))}
.dq-session-badge-callout--over{color:var(--dsw-alias-state-error-primary,#cf222e);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(207,34,46,.09))}
.dq-session-badge-section{margin:0 0 4px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dq-session-badge-dimensions{margin:0 0 8px;padding:0;list-style:none;display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-variant-numeric:tabular-nums}
.dq-session-badge-dimension{display:contents}
.dq-session-badge-dimension-label{color:var(--dsw-alias-label-secondary)}
.dq-session-badge-dimension-value{color:var(--dsw-alias-label-primary);text-align:right}
.dq-session-badge-dimension--warn .dq-session-badge-dimension-value{color:var(--dsw-alias-state-warn-label,#9a6700);font-weight:600}
.dq-session-badge-dimension--over .dq-session-badge-dimension-value{color:var(--dsw-alias-state-error-primary,#cf222e);font-weight:600}
.dq-session-badge-handoff{border:1px solid transparent;background:var(--dsw-alias-state-business-primary,#0969da);color:var(--dsw-alias-label-primary-inverted,#ffffff);cursor:pointer;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;margin-bottom:6px}
.dq-session-badge-handoff:hover{opacity:.9}
.dq-session-badge-handoff:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:2px}
.dq-session-badge-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.dq-session-badge-actions .dq-session-badge-handoff{margin-bottom:0}
.dq-session-badge-secondary{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer;padding:5px 10px;border-radius:8px;font-size:12px}
.dq-session-badge-secondary:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06))}
.dq-session-badge-secondary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:2px}
.dq-session-badge-expiry{display:flex;align-items:center;gap:6px;margin:0 0 8px;color:var(--dsw-alias-label-tertiary,#59636e)}
.dq-session-badge-expiry input{width:56px;box-sizing:border-box;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));background:var(--dsw-alias-bg-layer-1,#ffffff);color:var(--dsw-alias-label-primary,#1f2328);font-size:12px;font-variant-numeric:tabular-nums}
.dq-session-badge-expiry input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:1px}
.dq-session-badge-hint{margin:0;color:var(--dsw-alias-label-tertiary,#59636e)}
/* Wrap-up reminder dock: the additive strip above the composer card, matching
   the host's own queue / todo / goal rows. */
.dq-handoff-dock{box-sizing:border-box;display:flex;align-items:center;gap:8px;margin:0 auto;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:12px;line-height:1.45}
.dq-handoff-dock--warn{border-color:var(--dsw-alias-state-warn-secondary,rgba(154,103,0,.45));background:var(--dsw-alias-state-warn-tertiary,rgba(154,103,0,.1))}
.dq-handoff-dock--over{border-color:var(--dsw-alias-state-error-primary,#cf222e);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(207,34,46,.09))}
.dq-handoff-dock-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary,#2da44e)}
.dq-handoff-dock-dot--warn{background:var(--dsw-alias-state-warn-primary,#bf8700)}
.dq-handoff-dock-dot--over{background:var(--dsw-alias-state-error-primary,#cf222e)}
.dq-handoff-dock-text{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0;flex:1}
.dq-handoff-dock-text b{font-weight:600;color:var(--dsw-alias-label-primary)}
.dq-handoff-dock--warn .dq-handoff-dock-text b{color:var(--dsw-alias-state-warn-label,#9a6700)}
.dq-handoff-dock--over .dq-handoff-dock-text b{color:var(--dsw-alias-state-error-primary,#cf222e)}
.dq-handoff-dock-note{color:var(--dsw-alias-label-tertiary)}
.dq-handoff-dock-actions{display:flex;align-items:center;gap:6px;flex:none}
.dq-handoff-dock-primary{border:1px solid transparent;background:var(--dsw-alias-state-business-primary,#0969da);color:var(--dsw-alias-label-primary-inverted,#ffffff);cursor:pointer;padding:3px 10px;border-radius:8px;font-size:12px;font-weight:600}
.dq-handoff-dock-primary:hover{opacity:.9}
.dq-handoff-dock-primary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:2px}
.dq-handoff-dock-dismiss{border:none;background:transparent;cursor:pointer;padding:3px 8px;border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dq-handoff-dock-dismiss:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dq-handoff-dock-dismiss:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#0969da);outline-offset:1px}
`
