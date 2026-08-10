import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* 品牌色 */
        'brand-pink': 'var(--brand-pink)',
        'brand-pink-hover': 'var(--brand-pink-hover)',
        'brand-cyan': 'var(--brand-cyan)',
        'brand-cyan-hover': 'var(--brand-cyan-hover)',
        /* 背景阶梯 */
        'bg-root': 'var(--bg-root)',
        'bg-layer-1': 'var(--bg-layer-1)',
        'bg-layer-2': 'var(--bg-layer-2)',
        'bg-layer-3': 'var(--bg-layer-3)',
        /* 文字 */
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        /* 边框 */
        'border-default': 'var(--border-default)',
        'border-subtle': 'var(--border-subtle)',
        /* 语义色 */
        'success': 'var(--success)',
        'warning': 'var(--warning)',
        'danger': 'var(--danger)',
        'info': 'var(--info)',
        /* 兼容旧 code */
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
