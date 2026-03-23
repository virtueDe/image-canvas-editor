import '@unocss/reset/tailwind.css';
import 'virtual:uno.css';
import './styles.css';
import { createApp } from './app';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('未找到应用挂载节点 #app');
}

createApp(root);
