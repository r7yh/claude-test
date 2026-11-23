(() => {
  const $ = (id) => document.getElementById(id);
  const cardEl = $('card');
  let cards = [];
  let index = 0;

  function render() {
    cardEl.classList.remove('flipped');
    if (cards.length === 0) {
      $('phrase').textContent = 'カードがありません';
      $('translation').textContent = '';
      $('note').innerHTML = '';
      $('counter').textContent = '0 / 0';
      return;
    }
    const c = cards[index];
    $('phrase').textContent = c.phrase;
    $('translation').textContent = c.translation;
    // note は <b> <i> などのHTMLタグを含むので innerHTML で描画する
    $('note').innerHTML = c.note || '';
    $('counter').textContent = `${index + 1} / ${cards.length}`;
  }

  function move(step) {
    if (cards.length === 0) return;
    index = (index + step + cards.length) % cards.length;
    render();
  }

  cardEl.addEventListener('click', () => cardEl.classList.toggle('flipped'));
  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cardEl.classList.toggle('flipped'); }
  });
  $('prevBtn').addEventListener('click', () => move(-1));
  $('nextBtn').addEventListener('click', () => move(1));

  fetch('cards.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => { cards = data; render(); })
    .catch(() => { $('phrase').textContent = 'cards.json を読み込めませんでした'; });
})();
