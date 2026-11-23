(() => {
  const $ = (id) => document.getElementById(id);
  const cardEl = $('card');
  const STORAGE_KEY = 'wordcard.status.v1'; // { [phrase]: 'known' | 'notyet' }

  let allCards = [];   // cards.json の全カード
  let deck = [];       // 現在の出題順（モードやシャッフルを反映）
  let index = 0;
  let status = loadStatus();

  function loadStatus() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function saveStatus() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(status)); } catch { /* 保存できない環境では無視 */ }
  }

  function buildDeck() {
    const onlyNotYet = $('onlyNotYet').checked;
    // 「まだ」モード：「覚えた」以外（未判定を含む）を出題
    deck = onlyNotYet ? allCards.filter((c) => status[c.phrase] !== 'known') : allCards.slice();
    index = 0;
  }

  function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    index = 0;
    render();
  }

  function render() {
    cardEl.classList.remove('flipped');
    $('grade').hidden = true;
    if (deck.length === 0) {
      $('phrase').textContent = $('onlyNotYet').checked ? '「まだ」のカードはありません 🎉' : 'カードがありません';
      $('translation').textContent = '';
      $('note').innerHTML = '';
      $('counter').textContent = '0 / 0';
      return;
    }
    const c = deck[index];
    $('phrase').textContent = c.phrase;
    $('translation').innerHTML = c.translation;
    // translation / note は <b> <i> などのHTMLタグを含むので innerHTML で描画する
    $('note').innerHTML = c.note || '';
    const knownCount = allCards.filter((x) => status[x.phrase] === 'known').length;
    $('counter').textContent = `${index + 1} / ${deck.length}（覚えた ${knownCount}）`;
  }

  function flip() {
    if (deck.length === 0) return;
    cardEl.classList.toggle('flipped');
    // 裏面を見たら「覚えた／まだ」を表示
    if (cardEl.classList.contains('flipped')) $('grade').hidden = false;
  }

  function move(step) {
    if (deck.length === 0) return;
    index = (index + step + deck.length) % deck.length;
    render();
  }

  function grade(value) {
    const c = deck[index];
    status[c.phrase] = value;
    saveStatus();
    if ($('onlyNotYet').checked && value === 'known') {
      // 「まだ」モードで覚えたカードは山札から外す
      deck.splice(index, 1);
      if (index >= deck.length) index = 0;
      render();
    } else {
      move(1);
    }
  }

  cardEl.addEventListener('click', flip);
  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  $('prevBtn').addEventListener('click', () => move(-1));
  $('nextBtn').addEventListener('click', () => move(1));
  $('shuffleBtn').addEventListener('click', shuffle);
  $('onlyNotYet').addEventListener('change', () => { buildDeck(); render(); });
  $('knownBtn').addEventListener('click', () => grade('known'));
  $('notYetBtn').addEventListener('click', () => grade('notyet'));

  fetch('cards.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => { allCards = data; buildDeck(); render(); })
    .catch(() => { $('phrase').textContent = 'cards.json を読み込めませんでした'; });
})();
