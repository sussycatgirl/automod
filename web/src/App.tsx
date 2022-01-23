import { Route, BrowserRouter, Routes } from 'react-router-dom';
import Home from './pages/Home';
import './App.css';
import '@revoltchat/ui/src/styles/dark.css';
import '@revoltchat/ui/src/styles/common.css';
import RequireAuth from './components/RequireAuth';

const API_URL = 'http://localhost:9000';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/dashboard' element={<RequireAuth><a>among us</a></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
export { API_URL }
