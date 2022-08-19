import { Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import './App.css';
import '@revoltchat/ui/src/styles/dark.css';
import '@revoltchat/ui/src/styles/common.css';
import RequireAuth from './components/RequireAuth';
import DashboardHome from './pages/DashboardHome';
import ServerDashboard from './pages/ServerDashboard/ServerDashboard';
import localforage from 'localforage';
import TexPage from './pages/Tex';

const API_URL = import.meta.env.VITE_API_URL?.toString()
  || 'http://localhost:9000';

const BOT_PREFIX = import.meta.env.VITE_BOT_PREFIX?.toString()
  || '/';

function App() {
  const authConfig = new URLSearchParams(window.location.search).get('setAuth');

  if (authConfig) {
    console.log('Using provided auth data');

    const [ user, token ] = authConfig.split(':');
    localforage.setItem('auth', {
      user: decodeURIComponent(user),
      token: decodeURIComponent(token),
    })
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/dashboard' element={<RequireAuth><DashboardHome /></RequireAuth>} />
        <Route path='/dashboard/:serverid' element={<RequireAuth><ServerDashboard /></RequireAuth>} />
        <Route path='/tex' element={<TexPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
export { API_URL, BOT_PREFIX }
