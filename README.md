# AsmWalker

A browser-based learning tool for exploring C-to-assembly correspondence, one instruction at a time.

👉 **https://asm-walker.vercel.app**

[日本語版 README](./README.ja.md)

---

## Features

- **Compile C code in-browser** — Uses the real GCC via the Godbolt Compiler Explorer API
- **Step through instructions one by one** — Use the `◀` / `▶` buttons or `←` / `→` keyboard shortcuts
- **Synchronized C and assembly highlighting** — See exactly which C line corresponds to each instruction
- **Live register and stack visualization** — Value changes are highlighted in color
- **Instruction explanations** — Full name, syntax, and execution effect for each instruction (EN/JA)
- **Stack frame diagram** — Visualize function call nesting with color-coded frames
- **ARM Cortex-M and x86-64 support**

## Supported Architectures

| Architecture | Compiler |
|---|---|
| ARM Cortex-M | ARM GCC 15.2.0 |
| x86-64 | x86-64 GCC 14.2.0 (Intel syntax) |

## Run Locally

```bash
git clone https://github.com/kubotak0310/asm-walker.git
cd asm-walker
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Tailwind CSS |
| i18n | vue-i18n v11 |
| Editor | CodeMirror 6 |
| Compilation | Godbolt Compiler Explorer API |
| Build | Vite |
| Hosting | Vercel |

## Learning Guides

Available from the Guide menu inside the tool *(currently Japanese only)*:

- [Machine Code, Assembly, and the PC](https://asm-walker.vercel.app/guide/machine-code.html)
- [How to Read Assembly](https://asm-walker.vercel.app/guide/asm-reading.html)
- [How the Stack Works](https://asm-walker.vercel.app/guide/stack.html)
- [How Function Calls Work](https://asm-walker.vercel.app/guide/function-call.html)
- [Conditional Branches and Flags](https://asm-walker.vercel.app/guide/branch.html)
- [Pointers and Assembly](https://asm-walker.vercel.app/guide/pointer.html)

## License

[MIT](./LICENSE)
