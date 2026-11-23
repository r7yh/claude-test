# 英単語カード

スマホ向けの英単語カード Web アプリです（HTML / CSS / JavaScript のみ、ビルド不要）。

- `index.html` / `style.css` / `app.js` … アプリ本体
- `cards.json` … カードデータ（Notion から自動生成）
- `scripts/fetch-notion.mjs` … Notion の表を読み取り `cards.json` を生成
- `.github/workflows/update-and-deploy.yml` … 毎日 Notion から更新し、GitHub Pages に公開

ローカルで確認する場合:

```bash
python3 -m http.server 8000
```

Notion から手動で更新する場合:

```bash
NOTION_TOKEN=secret_xxx node scripts/fetch-notion.mjs
```
