// ---- クラウド同期（Supabase） ----
// 学習記録（srs / settings / newlog）を、ログインしたユーザーごとに 1 行の JSON として保存する。
// 端末どうしの記録は「カードごとに新しい方を採用」して合体（マージ）する。
(() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const TABLE = 'user_progress';

  const listeners = [];
  let client = null;
  let user = null;
  let hooks = null; // { getLocal(), applyLocal(state) }
  let pushTimer = null;
  let lastSyncedAt = null;
  let status = enabled ? 'ログインしていません' : '同期は未設定です';

  const setStatus = (s) => { status = s; listeners.forEach((f) => f()); };

  // ---- マージ ----
  const newer = (a, b) => ((b?.updated || 0) > (a?.updated || 0) ? b : a);

  function mergeSrs(a = {}, b = {}) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = out[k] ? newer(out[k], v) : v;
    return out;
  }
  function mergeNewlog(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (a.date === b.date) return { date: a.date, phrases: [...new Set([...a.phrases, ...b.phrases])] };
    return a.date > b.date ? a : b;
  }
  function merge(local, remote) {
    if (!remote) return local;
    return {
      srs: mergeSrs(local.srs, remote.srs),
      settings: newer(local.settings, remote.settings),
      newlog: mergeNewlog(local.newlog, remote.newlog),
    };
  }

  // ---- 同期本体：取得 → マージ → 端末に反映 → 保存 ----
  let syncing = null;
  async function syncNow() {
    if (!client || !user || !hooks) return;
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        setStatus('同期中…');
        const { data, error } = await client.from(TABLE).select('data').eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        const local = hooks.getLocal();
        const merged = merge(local, data?.data);
        if (JSON.stringify(merged) !== JSON.stringify(local)) hooks.applyLocal(merged);
        if (JSON.stringify(merged) !== JSON.stringify(data?.data)) {
          const { error: e2 } = await client.from(TABLE)
            .upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() });
          if (e2) throw e2;
        }
        lastSyncedAt = new Date();
        setStatus('同期済み');
      } catch (e) {
        console.error(e);
        setStatus('同期に失敗しました（あとで再試行します）');
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  // 記録が変わったら少し待ってから送る（連打してもまとめて 1 回）
  function schedulePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 1500);
  }

  async function init(h) {
    hooks = h;
    if (!enabled) { setStatus(status); return; }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    client.auth.onAuthStateChange((_event, session) => {
      const prev = user?.id;
      user = session?.user || null;
      if (!user) setStatus('ログインしていません');
      else if (user.id !== prev) syncNow();
    });
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    if (user) syncNow(); else setStatus('ログインしていません');

    // アプリに戻ってきたとき・閉じるときにも同期
    document.addEventListener('visibilitychange', () => {
      if (!user) return;
      if (document.visibilityState === 'visible') syncNow();
      else { clearTimeout(pushTimer); syncNow(); }
    });
  }

  async function sendLoginEmail(email) {
    const redirect = location.origin + location.pathname;
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    if (error) throw error;
  }
  async function verifyCode(email, token) {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }
  async function signOut() {
    await client.auth.signOut();
    user = null;
    setStatus('ログインしていません');
  }

  window.CloudSync = {
    enabled,
    init, syncNow, schedulePush, sendLoginEmail, verifyCode, signOut,
    get user() { return user; },
    get status() { return status; },
    get lastSyncedAt() { return lastSyncedAt; },
    onChange: (f) => listeners.push(f),
    _merge: merge, // テスト用
  };
})();
