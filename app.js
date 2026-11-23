(() => {
  // ---- 新しい版が公開されていたら、URL を変えて読み込み直す（ブラウザのキャッシュ対策） ----
  // デプロイ時に index.html の APP_VERSION と version.json に同じ値が書き込まれる
  if (window.APP_VERSION && window.APP_VERSION !== 'dev') {
    fetch('version.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ v }) => {
        const url = new URL(location.href);
        // 古いページを表示中で、まだその版の URL に移動していなければ移動する（無限ループ防止）
        if (v && v !== window.APP_VERSION && url.searchParams.get('v') !== v) {
          url.searchParams.set('v', v);
          location.replace(url);
        }
      })
      .catch(() => { /* オフライン等では何もしない */ });
  }

  const $ = (id) => document.getElementById(id);
  const cardEl = $('card');

  // ---- localStorage ----
  const SRS_KEY = 'wordcard.srs.v1';         // { [phrase]: { due, interval, ease, reps, lapses } }
  const SETTINGS_KEY = 'wordcard.settings.v1'; // { newPerDay }
  const NEWLOG_KEY = 'wordcard.newlog.v1';    // { date, phrases: [...] } 今日出題した新規カード

  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存不可の環境は無視 */ } };

  let srs = load(SRS_KEY, {});
  let settings = { newPerDay: 10, frontLang: 'ja', ...load(SETTINGS_KEY, {}) };

  // ---- 日付（ローカル日付を "YYYY-MM-DD" で扱う） ----
  const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dateStr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };

  function newLog() {
    const log = load(NEWLOG_KEY, null);
    return log && log.date === today() ? log : { date: today(), phrases: [] };
  }

  // ---- SM-2 簡略版 ----
  // grade: 0=もう一度 1=難しい 2=普通 3=簡単
  function schedule(state, grade) {
    const s = state ? { ...state } : { interval: 0, ease: 2.5, reps: 0, lapses: 0 };
    if (grade === 0) {
      s.reps = 0;
      s.lapses += 1;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.interval = 0; // 今日中にもう一度
    } else {
      if (grade === 1) s.ease = Math.max(1.3, s.ease - 0.15);
      if (grade === 3) s.ease += 0.15;
      if (s.reps === 0) {
        s.interval = [0, 1, 1, 4][grade];
      } else if (s.reps === 1) {
        s.interval = [0, 3, 6, 8][grade];
      } else {
        const mult = [0, 1.2, s.ease, s.ease * 1.3][grade];
        s.interval = Math.max(s.interval + 1, Math.round(s.interval * mult));
      }
      s.reps += 1;
    }
    s.due = addDays(s.interval);
    return s;
  }

  const fmtInterval = (days) => (days === 0 ? '今日' : days < 30 ? `${days}日` : days < 365 ? `${Math.round(days / 30)}か月` : `${(days / 365).toFixed(1)}年`);

  // ---- 出題キュー ----
  let allCards = [];
  let queue = [];
  let index = 0;

  function buildQueue() {
    const t = today();
    const log = newLog();
    const review = [];
    const fresh = [];
    for (const c of allCards) {
      const st = srs[c.phrase];
      if (st) {
        if (st.due <= t) review.push(c);
      } else {
        fresh.push(c);
      }
    }
    // 新規カード：今日すでに出したものは上限に数えた上で残す
    const shownToday = fresh.filter((c) => log.phrases.includes(c.phrase));
    const remainSlots = Math.max(0, settings.newPerDay - log.phrases.length);
    const freshToday = shownToday.concat(fresh.filter((c) => !log.phrases.includes(c.phrase)).slice(0, remainSlots));
    // 期日の古い復習カードから → 新規カード（表の上＝新しい単語から）
    review.sort((a, b) => srs[a.phrase].due.localeCompare(srs[b.phrase].due));
    queue = review.concat(freshToday);
    index = 0;
  }

  function shuffle() {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    index = 0;
    render();
  }

  function render() {
    cardEl.classList.remove('flipped');
    $('grade').hidden = true;
    $('controls').hidden = false;

    const newCount = queue.filter((c) => !srs[c.phrase]).length;
    $('remainingNum').textContent = queue.length;
    $('breakdown').textContent = `復習 ${queue.length - newCount} ／ 新規 ${newCount}`;

    if (queue.length === 0) {
      $('front').textContent = allCards.length ? '今日の復習は完了です 🎉' : 'カードがありません';
      $('answer').innerHTML = '';
      $('sub').innerHTML = '';
      $('note').innerHTML = '';
      return;
    }
    const c = queue[index];
    // translation / note は <b> <i> などのHTMLタグを含むので innerHTML で描画する
    if (settings.frontLang === 'ja') {
      // 表：和訳 → 裏：英語フレーズ（＋和訳を小さく）
      $('front').innerHTML = c.translation;
      $('answer').textContent = c.phrase;
      $('sub').innerHTML = c.translation;
    } else {
      // 表：英語フレーズ → 裏：和訳
      $('front').textContent = c.phrase;
      $('answer').innerHTML = c.translation;
      $('sub').innerHTML = '';
    }
    $('note').innerHTML = c.note || '';
  }

  function flip() {
    if (queue.length === 0) return;
    cardEl.classList.toggle('flipped');
    const flipped = cardEl.classList.contains('flipped');
    $('grade').hidden = !flipped;
    $('controls').hidden = flipped;
    if (flipped) {
      // 各ボタンに「次回はいつか」を表示
      const st = srs[queue[index].phrase];
      document.querySelectorAll('[data-preview]').forEach((el) => {
        el.textContent = fmtInterval(schedule(st, Number(el.dataset.preview)).interval);
      });
    }
  }

  function move(step) {
    if (queue.length === 0) return;
    index = (index + step + queue.length) % queue.length;
    render();
  }

  function grade(g) {
    const c = queue[index];
    if (!srs[c.phrase]) {
      const log = newLog();
      if (!log.phrases.includes(c.phrase)) log.phrases.push(c.phrase);
      save(NEWLOG_KEY, log);
    }
    srs[c.phrase] = schedule(srs[c.phrase], g);
    save(SRS_KEY, srs);

    queue.splice(index, 1);
    if (g === 0) queue.push(c); // 「もう一度」は今日の最後に再出題
    if (index >= queue.length) index = 0;
    render();
  }

  // ---- イベント ----
  cardEl.addEventListener('click', flip);
  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  $('prevBtn').addEventListener('click', () => move(-1));
  $('nextBtn').addEventListener('click', () => move(1));
  $('shuffleBtn').addEventListener('click', shuffle);
  document.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => grade(Number(b.dataset.grade))));

  const langBtn = $('frontLangBtn');
  const updateLangBtn = () => { langBtn.textContent = settings.frontLang === 'ja' ? '表：日本語' : '表：英語'; };
  updateLangBtn();
  langBtn.addEventListener('click', () => {
    settings.frontLang = settings.frontLang === 'ja' ? 'en' : 'ja';
    save(SETTINGS_KEY, settings);
    updateLangBtn();
    render();
  });

  const limitInput = $('newLimit');
  limitInput.value = settings.newPerDay;
  limitInput.addEventListener('change', () => {
    const n = Math.max(0, Math.min(999, parseInt(limitInput.value, 10) || 0));
    limitInput.value = n;
    settings.newPerDay = n;
    save(SETTINGS_KEY, settings);
    buildQueue();
    render();
  });

  fetch('cards.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => { allCards = data; buildQueue(); render(); })
    .catch(() => { $('front').textContent = 'cards.json を読み込めませんでした'; });
})();
