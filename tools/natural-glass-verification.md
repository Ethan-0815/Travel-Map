# Natural Glass verification — 2026-09-29

## Change scope
- Route duration only: existing duration divided by a further 1.18 (18% faster; 15.25% shorter duration).
- Shared glass CSS: translucent backgrounds, backdrop blur, subtle borders/shadows; no fixed reflection gradients.
- Five theme palettes softened; stylesheet cache keys updated.
- Protected-source hash check passes, including animation implementation after normalizing its duration/comment change.

## Browser regression (production MapView, in-memory fixture)
- Beijing → Shanghai → Guangzhou: PASS. Segment durations 2567 / 2683 ms; maximum head/line endpoint error 0.000249 px.
- At Shanghai: progress [1, 0], waiting true; second segment started only after map click. Final progress [1, 1], failures [].
- Beijing → Guangzhou: PASS. Duration 3167 ms; maximum endpoint error 0.000069 px; failures [].
- Formal app and regression tab captured warning/error logs: empty.

## Visual verification
- Saved map screenshots cover blue/red/yellow/green/orange in both light and dark modes: natural-light-*.png and natural-dark-*.png. These use production views with memory-only journey fixtures.
- Formal dark settings page loaded current natural-glass stylesheet URLs; computed panel fill rgba(16, 20, 26, 0.46).
- Formal page reported viewport width 479 and document scrollWidth 479: no horizontal overflow at that measured width.
- Requested viewport override 390×844 did not take effect (reported 479×548). Exact 390×844 verification remains unconfirmed. Override reset after test.
- Settings button clicks did not visibly navigate during this browser session; settings visual inspection used the existing /#/settings URL. Router was not changed.

## Static checks
- mapView.js syntax check: PASS.
- tools/smoke.cjs: SMOKE PASS.
- tools/natural-glass-check.cjs: PASS (protected files unchanged; route duration only; glass gradient removal and CSS brace checks).
