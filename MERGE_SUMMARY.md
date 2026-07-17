# Mnemox Extension v1.4.0 — Merge Summary

## What Was Merged

**v1.4.0 consolidates three streams into one unified release:**

### 1. **Chrome Web Store Fix** (from initial 1.3.3 → 1.3.4 fix)
- ✅ Removed unnecessary `"tabs"` permission from manifest
- ✅ Updated `STORE_LISTING.md` (removed stale permission justification)
- ✅ Complies with Chrome Web Store policy

### 2. **Codexcowork v1.4.0 Performance & Bug Fixes**
All improvements tested and passing 193 QE tests:

- **DEFECT-1 Fixed** (`scoring/trust.js`): Response truncation detection now works
  - Responses ending in `"..."` now correctly scored as incomplete (5 pts, not 30)
  - Added support for Unicode ellipsis (`…`)

- **Performance** (`content.js`): 
  - Replaced flat 50ms retry loop with bounded backoff (100/250/500/1000ms, capped 15s)
  - Coalesced observer calls via `requestAnimationFrame`/`queueWireObserver`
  - Fewer redundant DOM scans; debounced prompt text saves (400ms)

- **Performance** (`response-reader.js`):
  - Direct node inspection before fallback `querySelector` scan
  - `requestAnimationFrame`-batched mutations

- **Performance** (`ui/pageWorld.js`):
  - Result memoization—identical re-scored text replays cached result

- **Performance** (`ui/coach.js`):
  - Renders rule/suggestion details only when panel is open
  - Caches latest result to paint on panel open

- **Performance** (`background.js`):
  - Backend warmup fetch gated on opt-in flags (`TRACE_LOGGING`/`MEMORY_CONSISTENCY`)
  - 3-second abort timeout

### 3. **Test Suite**
- Copied all 13 test suites from Codexcowork (193 tests total)
- **Status: All passing** ✅ (193/193, 0 failed, 0 skipped)

## File Summary

**Root `/` now contains:**
- ✅ Fixed & merged code (Codexcowork improvements + Chrome Web Store compliance)
- ✅ Updated test suite (all tests passing)
- ✅ v1.4.0 manifest (no `tabs` permission)
- ✅ Clean zip: `mnemox-extension-v1.4.0.zip` (108KB, 25 core files + assets)

**Codexcowork/:**
- Optional: can be deleted (work is now merged into root)
- Backup of 1.4.0 branch if needed

## Next Steps: Chrome Web Store Resubmission

1. **Upload** `mnemox-extension-v1.4.0.zip` to the Chrome Web Store Developer Dashboard
2. **Update Store Listing** tab:
   - Title: `Mnemox Extension`
   - Summary: `Real-time prompt scorer and token counter. Works on any site. Zero API dependencies.`
   - Description: From `STORE_LISTING.md`
3. **Update Privacy Practices** tab:
   - Leave permission justifications for: `storage`, `scripting`, `activeTab`, `host_permissions`
   - No entry for `tabs` (removed)
4. **Submit for review** — expect 5-7 business days

---

**Version Chain:**
- v1.3.3 (original)
- v1.3.4 (Web Store fix attempt — removed tabs permission only, kept other code)
- v1.4.0 (final: Web Store fix + Codexcowork improvements + updated tests)
