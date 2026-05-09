# AsmWalker

C言語とアセンブラの対応を、1命令ずつ確認しながら学べるブラウザ学習ツール。

👉 **https://asm-walker.vercel.app**

📝 **[紹介記事（Zenn）](https://zenn.dev/kubotak0630/articles/480e2ef8322e6c)**

[English README](./README.md)

---

## できること

- **C コードをその場でコンパイル** — Godbolt Compiler Explorer API 経由で本物の GCC がコンパイル
- **1命令ずつステップ実行** — `◀` / `▶` ボタンまたはキーボードの `←` / `→` キーで操作
- **C の行とアセンブラの行が同時にハイライト** — どの C コードがどの命令に対応するかが一目でわかる
- **レジスタ・スタックの変化をリアルタイム表示** — 値の変化を色でハイライト
- **命令の説明（日本語 / 英語切り替え対応）** — 各命令のフルネーム・構文・実行結果を表示
- **スタックフレームの色分け図** — 関数呼び出しのネストをビジュアルで確認
- **ARM / x86-64 の両対応**

## 対応アーキテクチャ

| アーキテクチャ | コンパイラ |
|---|---|
| ARM Cortex-M | ARM GCC 15.2.0 |
| x86-64 | x86-64 GCC 14.2.0（Intel 構文） |

## ローカルで動かす

```bash
git clone https://github.com/kubotak0310/asm-walker.git
cd asm-walker
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

## 技術構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Vue 3 + TypeScript + Tailwind CSS |
| 国際化 | vue-i18n v11 |
| エディタ | CodeMirror 6 |
| コンパイル | Godbolt Compiler Explorer API |
| ビルドツール | Vite |
| ホスティング | Vercel |

## 学習ガイド

ツール内のガイドメニューから読めます：

- [マシン語とアセンブラ、そして PC](https://asm-walker.vercel.app/guide/machine-code.html)
- [アセンブラの読み方](https://asm-walker.vercel.app/guide/asm-reading.html)
- [スタックの仕組み](https://asm-walker.vercel.app/guide/stack.html)
- [関数呼び出しの仕組み](https://asm-walker.vercel.app/guide/function-call.html)
- [条件分岐とフラグレジスタ](https://asm-walker.vercel.app/guide/branch.html)
- [ポインタとアセンブラ](https://asm-walker.vercel.app/guide/pointer.html)

## ライセンス

[MIT](./LICENSE)
