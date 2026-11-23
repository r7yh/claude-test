// Notion のページ内にある表（table ブロック）を読み取り、cards.json を生成するスクリプト
// 実行: NOTION_TOKEN=xxx node scripts/fetch-notion.mjs
// 依存パッケージなし（Node.js 18 以降の組み込み fetch を使用）

import { writeFile } from 'node:fs/promises';

const TOKEN = process.env.NOTION_TOKEN;
const PAGE_ID = process.env.NOTION_PAGE_ID || '3af3d265aec481ca900dd13a7b1c1115';
const OUTPUT = process.env.OUTPUT || 'cards.json';
const NOTION_VERSION = '2022-06-28';

// 見出し行の列名 → cards.json の項目名
const COLUMN_MAP = {
  'Phrase': 'phrase',
  '和訳': 'translation',
  '備考/例文': 'note',
};

async function notion(path) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ブロックの子要素を、ページネーションを辿ってすべて取得する
async function listChildren(blockId) {
  const results = [];
  let cursor;
  do {
    const q = new URLSearchParams({ page_size: '100' });
    if (cursor) q.set('start_cursor', cursor);
    const data = await notion(`/blocks/${blockId}/children?${q}`);
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

// ページ内の table ブロックを探す（トグルや列レイアウトの中にあっても見つける）
async function findTables(blockId, depth = 0) {
  const tables = [];
  for (const block of await listChildren(blockId)) {
    if (block.type === 'table') {
      tables.push(block);
    } else if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database' && depth < 3) {
      tables.push(...await findTables(block.id, depth + 1));
    }
  }
  return tables;
}

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Notion の rich_text 配列を HTML 文字列に変換（太字→<b>、斜体→<i> など）
export function richTextToHtml(richText = []) {
  return richText.map((rt) => {
    let html = escapeHtml(rt.plain_text || '').replace(/\n/g, '<br>');
    const a = rt.annotations || {};
    if (a.code) html = `<code>${html}</code>`;
    if (a.bold) html = `<b>${html}</b>`;
    if (a.italic) html = `<i>${html}</i>`;
    if (a.underline) html = `<u>${html}</u>`;
    if (a.strikethrough) html = `<s>${html}</s>`;
    const url = rt.href || rt.text?.link?.url;
    if (url && /^https?:\/\//.test(url)) {
      html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${html}</a>`;
    }
    return html;
  }).join('');
}

const plainText = (richText = []) => richText.map((rt) => rt.plain_text || '').join('').trim();

export function rowsToCards(rows) {
  if (rows.length === 0) return [];
  // 1行目は見出し行。列名から列番号を決める
  const header = rows[0].table_row.cells.map(plainText);
  const colIndex = {};
  for (const [name, key] of Object.entries(COLUMN_MAP)) {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`見出し行に「${name}」列が見つかりません（見出し: ${header.join(' | ')}）`);
    colIndex[key] = i;
  }
  return rows.slice(1)
    .map((row) => {
      const cells = row.table_row.cells;
      return {
        phrase: plainText(cells[colIndex.phrase]),
        translation: richTextToHtml(cells[colIndex.translation]),
        note: richTextToHtml(cells[colIndex.note]),
      };
    })
    .filter((c) => c.phrase !== ''); // 空行は除外
}

async function main() {
  if (!TOKEN) throw new Error('環境変数 NOTION_TOKEN が設定されていません');
  const tables = await findTables(PAGE_ID);
  if (tables.length === 0) throw new Error('ページ内に表が見つかりません。インテグレーションがページに接続されているか確認してください');

  // 見出しに「Phrase」列を含む最初の表を使う
  for (const table of tables) {
    const rows = (await listChildren(table.id)).filter((b) => b.type === 'table_row');
    const header = rows[0]?.table_row.cells.map(plainText) || [];
    if (!header.includes('Phrase')) continue;

    const cards = rowsToCards(rows); // 表の順番（新しい単語が上）のまま保存
    if (cards.length === 0) throw new Error('表にデータ行がありません');
    await writeFile(OUTPUT, JSON.stringify(cards, null, 2) + '\n');
    console.log(`${cards.length} 枚のカードを ${OUTPUT} に書き出しました`);
    return;
  }
  throw new Error('「Phrase」列を持つ表が見つかりません');
}

// テストから import されたときは main を実行しない
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
