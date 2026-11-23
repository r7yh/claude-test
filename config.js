// クラウド同期（Supabase）の設定
// 空のままなら同期機能はオフになり、これまでどおりブラウザ内だけに保存します。
// 公開時は GitHub Actions が、リポジトリの Variables（SUPABASE_URL / SUPABASE_KEY）の値でこのファイルを上書きします。
// ※ SUPABASE_KEY は「公開してよい鍵」（publishable key / anon key）です。service_role キーは絶対に入れないでください。
window.APP_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
