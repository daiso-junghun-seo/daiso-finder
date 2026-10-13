# UI Taste + Clarity — design (2026-10-13)

Owner verdicts: (a) the DAISO red reads cheap at button scale — kill it;
(b) the locale toggle misreads as current state; (c) glass looks unapplied.
Same Bible contract throughout (copy/states/IA/roles/AA unchanged).

## 1. Moves

1. **Ink primary**: `--action-bg` #1b1b1d / fg #fff; dark #f5f5f5 / #121212
   (iOS idiom). `--color-accent` stays defined as an unreferenced brand reserve
   (tokens test requires its dark override; nothing rendered uses it).
   Focus ring rides `--action-bg`. Icons regen ink via scripts/make-icons.py.
2. **Segmented locale** (fieldset + hidden legend + aria-pressed segments):
   pressed = CURRENT language — the single toggle showed only the target and
   misread as current. 44px segments kept (32pt idiom rejected on §6).
3. **Glass depth**: `--glass-blur` 8→16px (tints unchanged → contrast rows hold
   untouched). GPU watch recorded: mid-range Android field check on deploy (G3).
4. **Guidance subline** (taste): one orienting sentence under the headline,
   draft-flagged, ko+en (see §B41 record for the full taste pass).

## 2. Tests

- contrast.test.ts recomputes every pair against new values (no new pairs).
- Segmented: pressed-current assertions both locales + callback args.
- Suite locale pins unchanged; EN E2E unchanged.

## 3. Gate

Standard branch gate (vitest · tsc · biome · build · Playwright) + fresh review.
Docs: §B43. No push, no deploy.
