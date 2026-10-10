import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ModelProvider} from './ml/ModelContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ModelProvider>
    <App />
  </ModelProvider>,
);
