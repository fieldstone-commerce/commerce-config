// Fieldstone's own judgement about when a shopper needs a hand. Runs in the
// platform's sandbox: no network, no credential, and nothing to read but a
// counter it keeps itself.
var DEFAULTS = {
  searchesBeforeOffering: 3,
  viewsBeforeOffering: 6,
  sessionMinutes: 45,
  offerText: 'Can I help you find something? Tell me about the room rather than the product.',
  acceptLabel: 'Yes please',
  opening: 'Tell me about the space — how big is it, and what has to go in it?'
};

// A store that cannot be reached costs the OFFER, never the shop. Falling
// back to a fresh tally means the counters never accumulate and nothing is
// ever offered; falling back the other way would nag every shopper on every
// page for as long as the outage lasted.
async function orElse(promise, fallback) {
  try { var v = await promise; return v === null || v === undefined ? fallback : v; }
  catch (e) { console.warn('browsing-help: store unavailable — ' + e.message); return fallback; }
}

var cfg = Object.assign({}, DEFAULTS, await orElse(host.storage.get('browsing-help', 'config'), {}));

// No visit id, no tally. The platform mints one per visit and passes what
// the browser sent; an absent one means a request that cannot be counted
// against anything, and counting it against everybody would be worse.
var visit = String(input.sessionId || '');
if (!visit) return {};

var now = Date.now();
var key = 'visit:' + visit;
var state = await orElse(host.storage.get('browsing-help', key), null);

// A tally older than a visit is a new visit. Resuming it would ask somebody
// whether they needed help on the first search of the following morning.
if (!state || typeof state !== 'object' ||
    now - Number(state.at || 0) > cfg.sessionMinutes * 60000) {
  state = { searches: 0, views: 0, dismissed: false, at: now };
}

async function remember() {
  state.at = now;
  try { await host.storage.put('browsing-help', key, state); }
  catch (e) { console.warn('browsing-help: could not write the tally — ' + e.message); }
}

// No is final, for this visit, and it is remembered HERE rather than in the
// page. A flag in the browser is defeated by a second tab and by a reload,
// and a prompt that comes back is the one thing everybody hates about this.
if (input.signal === 'dismissed') {
  state.dismissed = true;
  await remember();
  return {};
}
if (state.dismissed) return {};

// Something in the basket is a shopper who IS getting somewhere. Checked
// before the counters move, so a person who is buying is never counted
// towards being stuck.
if (Number(input.basketItemCount || 0) > 0) return {};

if (input.signal === 'search') state.searches = Number(state.searches || 0) + 1;
else if (input.signal === 'view') state.views = Number(state.views || 0) + 1;
else return {};
await remember();

// The thresholds are cfg's, never DEFAULTS'. A constant here would be
// Fieldstone's opinion frozen into code their own staff cannot change,
// which is the same mistake as the platform holding it — one step further
// from the person whose shop it is.
if (state.searches < cfg.searchesBeforeOffering && state.views < cfg.viewsBeforeOffering) {
  return {};
}

console.log('browsing-help: offering after ' + state.searches + ' searches and ' + state.views + ' views');
return {
  elements: [{
    type: 'prompt',
    action: 'open-assistant',
    text: cfg.offerText,
    accept: cfg.acceptLabel,
    ask: cfg.opening
  }]
};
