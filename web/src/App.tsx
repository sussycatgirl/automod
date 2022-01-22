import { Route, BrowserRouter, Routes } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={(
          <div>
            <h1>todo: web design</h1>
            <a href='/dashboard'>sign in</a>
          </div>
        )} />
        <Route path='/dashboard' element={<span>todo</span>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
